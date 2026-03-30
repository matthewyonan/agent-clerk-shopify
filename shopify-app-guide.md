# AgentClerk Shopify App — Development Guide

## Overview

Build a Shopify app version of AgentClerk — an AI sales and support agent that answers buyers, generates quotes, closes sales, and handles support. The WordPress plugin version exists at `github.com/matthewyonan/agent-clerk-plugin` as reference.

The Shopify app reuses the same backend (`app.agentclerk.io/api`) and AI logic (Anthropic Claude) but wraps it in Shopify's app framework.

---

## Technology Stack

| Component | Technology |
|---|---|
| Framework | React Router v7 (Shopify's recommended successor to Remix) |
| UI | Polaris (Shopify design system) + App Bridge |
| Storefront widget | Theme App Extension (App Embed Block + JS/CSS) |
| Database | Prisma ORM with PostgreSQL |
| Auth | Shopify managed installation + token exchange |
| APIs | Shopify GraphQL Admin API |
| CLI | Shopify CLI (`shopify app init`, `shopify app dev`, `shopify app deploy`) |
| Node.js | 22+ |
| Deployment | Developer-hosted (Fly.io, Railway, or similar) |

---

## Project Structure

```
agent-clerk-shopify/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx              # Dashboard (home page)
│   │   ├── app.setup.tsx               # Onboarding wizard
│   │   ├── app.conversations.tsx       # Conversation history
│   │   ├── app.sales.tsx               # Sales & billing
│   │   ├── app.support.tsx             # Escalations + plugin help
│   │   ├── app.settings.tsx            # Business, catalog, placement, API key, escalation
│   │   ├── app.settings.business.tsx   # Business & Agent tab
│   │   ├── app.settings.catalog.tsx    # Catalog tab
│   │   ├── app.settings.placement.tsx  # Placement tab
│   │   ├── app.settings.apikey.tsx     # API Key tab
│   │   ├── app.settings.support.tsx    # Support & Escalation tab
│   │   ├── api.chat.tsx                # Chat API endpoint (for storefront widget)
│   │   ├── api.a2a.tsx                 # A2A protocol endpoints
│   │   ├── webhooks.tsx                # Shopify webhook handlers
│   │   └── auth.$.tsx                  # Auth catch-all (Shopify managed)
│   ├── components/
│   │   ├── ChatPreview.tsx             # Chat preview component for test/setup
│   │   ├── OnboardingWizard.tsx        # Multi-step setup wizard
│   │   ├── ReadinessScores.tsx         # Readiness indicators
│   │   └── PromoCodeInput.tsx          # Promo code field component
│   ├── lib/
│   │   ├── agent.server.ts             # AI agent logic (Anthropic calls, system prompt, tool_use)
│   │   ├── scanner.server.ts           # Store scanner (products, pages, policies)
│   │   ├── backend.server.ts           # AgentClerk backend API client
│   │   ├── billing.server.ts           # Billing status, license management
│   │   └── a2a.server.ts              # A2A protocol handler
│   └── shopify.server.ts              # Shopify auth + API setup
├── extensions/
│   └── theme-chat-widget/
│       ├── blocks/
│       │   └── chat-widget.liquid      # App Embed Block definition
│       ├── assets/
│       │   ├── agentclerk-chat.js      # Chat widget JavaScript
│       │   └── agentclerk-chat.css     # Chat widget styles
│       └── shopify.extension.toml      # Extension config
├── prisma/
│   └── schema.prisma                   # Database schema
├── shopify.app.toml                    # App config, scopes, webhooks
├── package.json
└── .env
```

---

## Shopify App Configuration (`shopify.app.toml`)

```toml
name = "AgentClerk"
client_id = "YOUR_CLIENT_ID"
application_url = "https://your-app-server.fly.dev"

[access_scopes]
scopes = "read_products,read_orders,read_customers,read_content,read_themes"

[auth]
redirect_urls = ["https://your-app-server.fly.dev/auth/callback"]

[webhooks]
api_version = "2025-04"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  topics = ["orders/create", "orders/paid"]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  topics = ["products/create", "products/update", "products/delete"]
  uri = "/webhooks"

[app_proxy]
url = "https://your-app-server.fly.dev/api"
subpath = "agentclerk"
subpath_prefix = "apps"
# This makes the chat widget accessible at: mystore.com/apps/agentclerk/chat
```

---

## Database Schema (Prisma)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Shopify session storage (required by @shopify/shopify-app-remix)
model Session {
  id          String   @id
  shop        String
  state       String
  isOnline    Boolean  @default(false)
  scope       String?
  expires     DateTime?
  accessToken String
  userId      BigInt?
}

// AgentClerk install configuration
model Install {
  id              String   @id @default(cuid())
  shop            String   @unique
  shopDomain      String
  shopifyShopId   String?
  installSecret   String   // From backend registration
  tier            String   @default("byok") // byok | turnkey
  apiKey          String?  // Encrypted Anthropic API key (BYOK)
  pluginStatus    String   @default("onboarding") // onboarding | active | suspended
  onboardingStep  Int      @default(1)
  licenseStatus   String   @default("none") // none | active
  licenseKey      String?
  billingStatus   String   @default("active")
  accruedFees     Float    @default(0)
  lastScanDate    DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  config          AgentConfig?
  conversations   Conversation[]
  a2aTasks        A2ATask[]
}

// Agent configuration (equivalent of agentclerk_agent_config option)
model AgentConfig {
  id                String   @id @default(cuid())
  installId         String   @unique
  install           Install  @relation(fields: [installId], references: [id])
  agentName         String   @default("AgentClerk")
  businessName      String   @default("")
  businessDesc      String   @default("")
  supportFile       String   @default("") @db.Text
  escalationEmail   String   @default("")
  escalationMessage String   @default("A support agent will follow up via email within 24 hours.")
  escalationMethod  String   @default("both") // email | wp | both
  escalationTopics  String[] // Array of topic strings
  refundPolicy      String   @default("") @db.Text
  licensePolicy     String   @default("") @db.Text
  deliveryPolicy    String   @default("") @db.Text
  productVisibility Json     @default("{}") // { productId: true/false }
  placementWidget   Boolean  @default(true)
  placementProduct  Boolean  @default(true)
  placementClerk    Boolean  @default(true)
  buttonLabel       String   @default("Get Help")
  position          String   @default("bottom-right")
  scanCache         Json     @default("{}") // Cached scan results
}

// Conversations
model Conversation {
  id           String    @id @default(cuid())
  installId    String
  install      Install   @relation(fields: [installId], references: [id])
  sessionId    String    @unique
  buyerType    String    @default("human") // human | agent
  firstMessage String?   @db.Text
  productName  String?
  outcome      String    @default("browsing") // browsing|quote|purchased|support|abandoned|escalated
  quoteLinkId  String?
  saleAmount   Float?
  agentFee     Float?
  startedAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  messages     Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // user | assistant
  content        String       @db.Text
  createdAt      DateTime     @default(now())
}

// Quote links for checkout tracking
model QuoteLink {
  id             String   @id @default(cuid())
  conversationId String
  productId      String   // Shopify product GID
  productName    String?
  amount         Float
  checkoutUrl    String?  // Shopify checkout URL
  orderId        String?  // Shopify order GID if completed
  status         String   @default("pending") // pending | completed | expired
  expiresAt      DateTime
  createdAt      DateTime @default(now())
}

// A2A protocol tasks
model A2ATask {
  id          String         @id @default(cuid())
  installId   String
  install     Install        @relation(fields: [installId], references: [id])
  contextId   String?
  sessionId   String
  status      String         @default("TASK_STATE_SUBMITTED")
  errorMsg    String?        @db.Text
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  messages    A2AMessage[]
  artifacts   A2AArtifact[]
}

model A2AMessage {
  id        String   @id @default(cuid())
  taskId    String
  task      A2ATask  @relation(fields: [taskId], references: [id])
  messageId String
  role      String   // ROLE_USER | ROLE_AGENT
  content   String   @db.Text
  createdAt DateTime @default(now())
}

model A2AArtifact {
  id         String   @id @default(cuid())
  taskId     String
  task       A2ATask  @relation(fields: [taskId], references: [id])
  artifactId String
  name       String?
  partsJson  String   @db.Text
  createdAt  DateTime @default(now())
}
```

---

## Feature Mapping: WordPress → Shopify

### Onboarding (Setup Wizard)

| Step | WordPress | Shopify |
|---|---|---|
| 1. Choose tier | PHP form + AJAX | Polaris page with RadioButton cards |
| 2. Scan site | `AgentClerk_Scanner` crawls URLs | GraphQL queries for products, pages, blogs, policies |
| 3. Review & fill gaps | AI chat with tool_use | Same AI logic, React chat component |
| 4. Catalog | WooCommerce products list | Shopify products via GraphQL + ResourcePicker |
| 5. Placement | Toggle switches | Theme app extension settings |
| 6. Test & go live | Test chat + readiness scores | Same, Polaris layout |

### Scanner (Step 2)

Instead of crawling URLs via HTTP, the Shopify scanner uses GraphQL:

```graphql
# Fetch all products
query {
  products(first: 50) {
    edges {
      node {
        id title description bodyHtml
        variants(first: 5) { edges { node { price } } }
        status
        productType
      }
    }
  }
}

# Fetch store pages
query {
  pages(first: 50) {
    edges { node { id title body } }
  }
}

# Fetch blog posts
query {
  blogs(first: 5) {
    edges {
      node {
        articles(first: 20) {
          edges { node { id title contentHtml } }
        }
      }
    }
  }
}

# Fetch store policies (refund, privacy, terms, shipping)
query {
  shop {
    name description
    refundPolicy { body }
    privacyPolicy { body }
    termsOfService { body }
    shippingPolicy { body }
  }
}
```

### Chat Widget (Theme App Extension)

The storefront chat widget is a **Theme App Extension** (App Embed Block):

- `blocks/chat-widget.liquid` — Liquid template that loads the JS/CSS
- `assets/agentclerk-chat.js` — Port of the WordPress `agentclerk-widget.js`
- `assets/agentclerk-chat.css` — Port of the WordPress `agentclerk-widget.css`
- Communication: Widget JS sends messages to **App Proxy** URL (`/apps/agentclerk/chat`)
- App Proxy forwards to your app server's `api.chat.tsx` route
- The route calls Anthropic (BYOK) or the backend proxy (TurnKey)

**Key difference from WordPress:** The widget can't directly call `admin-ajax.php`. It uses the Shopify App Proxy, which authenticates requests with HMAC and forwards to your server.

### Admin Pages

Each admin page is a React Router route using Polaris components:

```tsx
// app/routes/app._index.tsx (Dashboard)
import { Page, Layout, Card, DataTable } from "@shopify/polaris";

export default function Dashboard() {
  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card title="Conversations today">
            {/* Stats grid */}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### AI Agent Logic (`app/lib/agent.server.ts`)

Port the PHP `AgentClerk_Agent` class to TypeScript:

- `buildSystemPrompt(buyerType, config, products)` — same logic
- `callAnthropic(systemPrompt, messages, tools, testMode)` — same API call
- `processChat(message, sessionId, buyerType, testMode)` — shared entry point
- `processQuoteToolCall(input, conversation)` — generate Shopify checkout URL instead of WP quote link
- `detectBuyerType(message, userAgent)` — same detection logic

### Quote Generation

WordPress generates `/clerk-checkout/{token}` URLs. For Shopify, use the **Storefront API** to create a checkout:

```graphql
mutation {
  cartCreate(input: {
    lines: [{ merchandiseId: "gid://shopify/ProductVariant/12345", quantity: 1 }]
  }) {
    cart {
      id
      checkoutUrl
    }
  }
}
```

Or use **Draft Orders** via Admin API for more control:

```graphql
mutation {
  draftOrderCreate(input: {
    lineItems: [{ variantId: "gid://shopify/ProductVariant/12345", quantity: 1 }]
  }) {
    draftOrder {
      id
      invoiceUrl
    }
  }
}
```

### A2A Protocol

Same implementation as WordPress but in TypeScript. The A2A endpoints are served by your app server at `/api/a2a/*`. The Agent Card at `/.well-known/agent-card.json` can be served via the App Proxy.

---

## Backend API Communication

The Shopify app talks to `app.agentclerk.io/api` using the same pattern as WordPress:

```typescript
// app/lib/backend.server.ts
async function backendRequest(endpoint: string, options: RequestInit = {}) {
  const install = await getInstall(shopDomain);

  return fetch(`https://app.agentclerk.io/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-AgentClerk-Secret': install.installSecret,
      'X-AgentClerk-Site': `https://${install.shopDomain}`,
      ...options.headers,
    },
  });
}
```

---

## Webhook Handlers

```typescript
// app/routes/webhooks.tsx
export async function action({ request }) {
  const { topic, shop, payload } = await shopify.authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await markInstallInactive(shop);
      await notifyBackend(shop, "uninstall");
      break;

    case "ORDERS_CREATE":
    case "ORDERS_PAID":
      await handleOrderCompleted(shop, payload);
      // Check if order came from an AgentClerk quote link
      // Calculate fee, notify backend
      break;

    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE":
    case "PRODUCTS_DELETE":
      await invalidateProductCache(shop);
      break;
  }

  return new Response();
}
```

---

## Development Workflow

```bash
# 1. Scaffold
shopify app init --template=react-router

# 2. Install dependencies
npm install @anthropic-ai/sdk prisma @prisma/client

# 3. Set up database
npx prisma migrate dev

# 4. Configure .env
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx
AGENTCLERK_BACKEND_URL=https://app.agentclerk.io/api
DATABASE_URL=postgresql://...

# 5. Run development server
shopify app dev

# 6. Generate theme extension
shopify app generate extension --type theme_app_extension --name theme-chat-widget

# 7. Deploy extensions
shopify app deploy
```

---

## Promo Code Support

Same flow as WordPress — pass `promoCode` in checkout requests:

```typescript
const response = await backendRequest('/license/checkout', {
  method: 'POST',
  body: JSON.stringify({
    successUrl: `https://${shop}/admin/apps/agentclerk?license_success=1`,
    cancelUrl: `https://${shop}/admin/apps/agentclerk/sales`,
    promoCode: promoCode || undefined,
  }),
});
```

Handle all three response types: Stripe redirect, instant activation, error.

---

## Key Differences from WordPress to Watch For

1. **No synchronous hooks** — everything is async (webhooks, API calls)
2. **No direct DB on merchant's server** — all data in your hosted Postgres
3. **Rate limits** — Shopify GraphQL has query cost limits; batch queries wisely
4. **App Proxy HMAC** — all storefront→server requests are signed by Shopify
5. **Theme extension limitations** — no checkout page access, limited Liquid scope
6. **Session management** — Shopify sessions expire; handle token refresh
7. **Billing** — Consider Shopify Billing API for App Store compliance later

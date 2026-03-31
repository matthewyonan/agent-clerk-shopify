-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Install" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyShopId" TEXT,
    "installSecret" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'byok',
    "apiKey" TEXT,
    "pluginStatus" TEXT NOT NULL DEFAULT 'onboarding',
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "licenseStatus" TEXT NOT NULL DEFAULT 'none',
    "licenseKey" TEXT,
    "billingStatus" TEXT NOT NULL DEFAULT 'active',
    "accruedFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastScanDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Install_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT 'AgentClerk',
    "businessName" TEXT NOT NULL DEFAULT '',
    "businessDesc" TEXT NOT NULL DEFAULT '',
    "supportFile" TEXT NOT NULL DEFAULT '',
    "escalationEmail" TEXT NOT NULL DEFAULT '',
    "escalationMessage" TEXT NOT NULL DEFAULT 'A support agent will follow up via email within 24 hours.',
    "escalationMethod" TEXT NOT NULL DEFAULT 'both',
    "escalationTopics" TEXT[],
    "refundPolicy" TEXT NOT NULL DEFAULT '',
    "licensePolicy" TEXT NOT NULL DEFAULT '',
    "deliveryPolicy" TEXT NOT NULL DEFAULT '',
    "productVisibility" JSONB NOT NULL DEFAULT '{}',
    "placementWidget" BOOLEAN NOT NULL DEFAULT true,
    "placementProduct" BOOLEAN NOT NULL DEFAULT true,
    "placementClerk" BOOLEAN NOT NULL DEFAULT true,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Get Help',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "scanCache" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "buyerType" TEXT NOT NULL DEFAULT 'human',
    "firstMessage" TEXT,
    "productName" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'browsing',
    "quoteLinkId" TEXT,
    "saleAmount" DOUBLE PRECISION,
    "agentFee" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLink" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "checkoutUrl" TEXT,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "A2ATask" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "contextId" TEXT,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TASK_STATE_SUBMITTED',
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "A2ATask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "A2AMessage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "A2AMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "A2AArtifact" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "name" TEXT,
    "partsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "A2AArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Install_shop_key" ON "Install"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_installId_key" ON "AgentConfig"("installId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_sessionId_key" ON "Conversation"("sessionId");

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_installId_fkey" FOREIGN KEY ("installId") REFERENCES "Install"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_installId_fkey" FOREIGN KEY ("installId") REFERENCES "Install"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2ATask" ADD CONSTRAINT "A2ATask_installId_fkey" FOREIGN KEY ("installId") REFERENCES "Install"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2AMessage" ADD CONSTRAINT "A2AMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "A2ATask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2AArtifact" ADD CONSTRAINT "A2AArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "A2ATask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


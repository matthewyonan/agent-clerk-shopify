import { Outlet } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { LinksFunction } from "@remix-run/node";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export default function App() {
  return (
    <AppProvider isEmbeddedApp apiKey={window.ENV?.SHOPIFY_API_KEY || ""}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/conversations">Conversations</a>
        <a href="/app/sales">Sales</a>
        <a href="/app/support">Support</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

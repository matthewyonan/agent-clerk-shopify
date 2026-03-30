import { Outlet } from "@remix-run/react";
import { Page, Tabs } from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "@remix-run/react";

const TABS = [
  { id: "business", content: "Business & Agent", url: "/app/settings/business" },
  { id: "catalog", content: "Catalog", url: "/app/settings/catalog" },
  { id: "placement", content: "Placement", url: "/app/settings/placement" },
  { id: "apikey", content: "API Key", url: "/app/settings/apikey" },
  { id: "support", content: "Support & Escalation", url: "/app/settings/support" },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedIndex = TABS.findIndex((t) =>
    location.pathname.includes(t.id),
  );
  const [selected, setSelected] = useState(Math.max(0, selectedIndex));

  const handleTabChange = useCallback(
    (index: number) => {
      setSelected(index);
      navigate(TABS[index].url);
    },
    [navigate],
  );

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <Tabs tabs={TABS} selected={selected} onSelect={handleTabChange}>
        <Outlet />
      </Tabs>
    </Page>
  );
}

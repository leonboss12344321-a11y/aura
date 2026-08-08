import Sidebar from "@/components/layout/Sidebar";
import Feed from "@/components/feed/Feed";
import MessagesView from "@/components/chat/MessagesView";
import ProfileView from "@/components/profile/ProfileView";
import ExploreView from "@/components/explore/ExploreView";
import NotificationsView from "@/components/notifications/NotificationsView";
import AdsDiagnosticsPanel from "@/components/feed/AdsDiagnosticsPanel";
import { NavProvider, useNav } from "@/contexts/NavContext";

const Shell = () => {
  const { activeTab, setTab } = useNav();

  const renderContent = () => {
    switch (activeTab) {
      case "feed": return <Feed />;
      case "messages": return <MessagesView />;
      case "profile": return <ProfileView />;
      case "search": return <ExploreView />;
      case "notifications": return <NotificationsView />;
      default: return <Feed />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeTab={activeTab} onTabChange={setTab} />
      <main className="md:ml-[72px] lg:ml-[240px] pt-14 md:pt-0 pb-20 md:pb-0 p-3 sm:p-4 lg:p-8">
        {renderContent()}
      </main>
      <AdsDiagnosticsPanel />
    </div>
  );
};

const Index = () => (
  <NavProvider>
    <Shell />
  </NavProvider>
);

export default Index;

import { createContext, useContext, useState, ReactNode } from "react";

interface NavContextType {
  activeTab: string;
  viewedProfileId: string | null;
  pendingConversationId: string | null;
  setTab: (tab: string) => void;
  openProfile: (userId: string) => void;
  openConversation: (conversationId: string) => void;
  clearPendingConversation: () => void;
}

const NavContext = createContext<NavContextType>({} as NavContextType);

export const useNav = () => useContext(NavContext);

export const NavProvider = ({ children }: { children: ReactNode }) => {
  const [activeTab, setActiveTab] = useState("feed");
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  const setTab = (tab: string) => {
    setActiveTab(tab);
    if (tab === "profile") setViewedProfileId(null);
  };

  const openProfile = (userId: string) => {
    setViewedProfileId(userId);
    setActiveTab("profile");
  };

  const openConversation = (conversationId: string) => {
    setPendingConversationId(conversationId);
    setActiveTab("messages");
  };

  const clearPendingConversation = () => setPendingConversationId(null);

  return (
    <NavContext.Provider
      value={{
        activeTab,
        viewedProfileId,
        pendingConversationId,
        setTab,
        openProfile,
        openConversation,
        clearPendingConversation,
      }}
    >
      {children}
    </NavContext.Provider>
  );
};

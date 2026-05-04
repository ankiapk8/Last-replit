import { createContext, useContext } from "react";
import { useStudyTopics, type UseStudyTopicsResult } from "@/hooks/use-study-topics";

const StudyTopicsContext = createContext<UseStudyTopicsResult | null>(null);

export function StudyTopicsProvider({ children }: { children: React.ReactNode }) {
  const value = useStudyTopics();
  return (
    <StudyTopicsContext.Provider value={value}>
      {children}
    </StudyTopicsContext.Provider>
  );
}

export function useStudyTopicsContext(): UseStudyTopicsResult {
  const ctx = useContext(StudyTopicsContext);
  if (!ctx) throw new Error("useStudyTopicsContext must be used inside StudyTopicsProvider");
  return ctx;
}

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Topic } from "@/lib/study-planner/topics";
import {
  ALL_SUBJECT_GROUPS,
  getCustomGroups, saveCustomGroups,
  type CustomSubjectGroup,
} from "@/lib/study-planner/topics";
import { getAllTopics as fetchAllTopics, upsertTopics as saveTopics } from "@/lib/study-planner/api";

export interface UseStudyTopicsResult {
  topicsMap: Record<string, Topic[]>;
  isLoading: boolean;
  customGroups: CustomSubjectGroup[];
  upsertTopics: (storageKey: string, topics: Topic[]) => void;
  getAllTopics: () => Topic[];
  updateCustomGroups: (groups: CustomSubjectGroup[]) => void;
}

export function useStudyTopics(): UseStudyTopicsResult {
  const [customGroups, setCustomGroupsState] = useState<CustomSubjectGroup[]>(() => getCustomGroups());
  const [topicsMap, setTopicsMap] = useState<Record<string, Topic[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handler = () => {
      const groups = getCustomGroups();
      setCustomGroupsState(groups);
    };
    window.addEventListener("sp-custom-groups-updated", handler);
    return () => window.removeEventListener("sp-custom-groups-updated", handler);
  }, []);

  const getCustomKeys = useCallback((groups: CustomSubjectGroup[]) =>
    groups.flatMap(g => g.subjects.map(s => s.storageKey)), []);

  const allKeys = useMemo(() => [...new Set([...ALL_SUBJECT_GROUPS.map(g => g.storageKey), ...getCustomKeys(customGroups)])], [customGroups, getCustomKeys]);

  useEffect(() => {
    let mounted = true;
    fetchAllTopics()
      .then(({ topics }) => {
        if (!mounted) return;
        setTopicsMap(allKeys.reduce<Record<string, Topic[]>>((acc, key) => {
          acc[key] = topics[key] ?? [];
          return acc;
        }, {}));
      })
      .catch(() => {
        if (!mounted) return;
        setTopicsMap(allKeys.reduce<Record<string, Topic[]>>((acc, key) => {
          acc[key] = [];
          return acc;
        }, {}));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [allKeys]);

  const upsertTopics = useCallback((storageKey: string, topics: Topic[]) => {
    setTopicsMap(prev => ({ ...prev, [storageKey]: topics }));
    void saveTopics(storageKey, topics);
  }, []);

  const getAllTopics = useCallback((): Topic[] => {
    return Object.values(topicsMap).flat();
  }, [topicsMap]);

  const updateCustomGroups = useCallback((groups: CustomSubjectGroup[]) => {
    saveCustomGroups(groups);
    setCustomGroupsState(groups);
    window.dispatchEvent(new CustomEvent("sp-custom-groups-updated"));
  }, []);

  return {
    topicsMap,
    isLoading,
    customGroups,
    upsertTopics,
    getAllTopics,
    updateCustomGroups,
  };
}

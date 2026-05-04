import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronUp, X, Check, GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudyTopicsContext } from "@/context/study-topics-context";
import {
  type CustomSubjectGroup, type CustomSubject,
  CUSTOM_COLOR_OPTIONS, CUSTOM_COLOR_STYLES, generateId,
} from "@/lib/study-planner/topics";

interface GroupFormData { emoji: string; label: string; color: string; }
function blankGroup(): GroupFormData { return { emoji: "📚", label: "", color: "blue" }; }

interface SubjectFormData { label: string; }
function blankSubject(): SubjectFormData { return { label: "" }; }

const COLOR_SWATCH: Record<string, string> = {
  blue:"bg-blue-500", purple:"bg-purple-500", orange:"bg-orange-500", green:"bg-green-500",
  pink:"bg-pink-500", teal:"bg-teal-500", red:"bg-red-500", indigo:"bg-indigo-500",
  cyan:"bg-cyan-500", amber:"bg-amber-500",
};

export default function ManageSubjects() {
  const [, nav] = useLocation();
  const { customGroups, updateCustomGroups } = useStudyTopicsContext();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormData>(blankGroup());
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingSubjectToGroupId, setAddingSubjectToGroupId] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState<{ groupId: string; subjectId: string } | null>(null);
  const [subjectForm, setSubjectForm] = useState<SubjectFormData>(blankSubject());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const saveGroups = (groups: CustomSubjectGroup[]) => updateCustomGroups(groups);

  const startAddGroup = () => {
    setGroupForm(blankGroup());
    setAddingGroup(true);
    setEditingGroupId(null);
  };

  const startEditGroup = (g: CustomSubjectGroup) => {
    setGroupForm({ emoji: g.emoji, label: g.label, color: g.color });
    setEditingGroupId(g.id);
    setAddingGroup(false);
  };

  const commitGroup = () => {
    if (!groupForm.label.trim()) return;
    if (addingGroup) {
      const newGroup: CustomSubjectGroup = {
        id: generateId(), emoji: groupForm.emoji || "📚",
        label: groupForm.label.trim(), color: groupForm.color, subjects: [],
      };
      saveGroups([...customGroups, newGroup]);
      setExpandedId(newGroup.id);
    } else if (editingGroupId) {
      saveGroups(customGroups.map(g =>
        g.id === editingGroupId
          ? { ...g, emoji: groupForm.emoji || "📚", label: groupForm.label.trim(), color: groupForm.color }
          : g
      ));
    }
    setAddingGroup(false);
    setEditingGroupId(null);
  };

  const deleteGroup = (id: string) => {
    saveGroups(customGroups.filter(g => g.id !== id));
    setDeleteConfirm(null);
    if (expandedId === id) setExpandedId(null);
  };

  const startAddSubject = (groupId: string) => {
    setSubjectForm(blankSubject());
    setAddingSubjectToGroupId(groupId);
    setEditingSubject(null);
  };

  const startEditSubject = (groupId: string, s: CustomSubject) => {
    setSubjectForm({ label: s.label });
    setEditingSubject({ groupId, subjectId: s.id });
    setAddingSubjectToGroupId(null);
  };

  const commitSubject = () => {
    if (!subjectForm.label.trim()) return;
    if (addingSubjectToGroupId) {
      const newSubject: CustomSubject = {
        id: generateId(),
        storageKey: "custom-" + generateId(),
        label: subjectForm.label.trim(),
      };
      saveGroups(customGroups.map(g =>
        g.id === addingSubjectToGroupId
          ? { ...g, subjects: [...g.subjects, newSubject] }
          : g
      ));
    } else if (editingSubject) {
      saveGroups(customGroups.map(g =>
        g.id === editingSubject.groupId
          ? { ...g, subjects: g.subjects.map(s =>
              s.id === editingSubject.subjectId ? { ...s, label: subjectForm.label.trim() } : s
            )}
          : g
      ));
    }
    setAddingSubjectToGroupId(null);
    setEditingSubject(null);
  };

  const deleteSubject = (groupId: string, subjectId: string) => {
    saveGroups(customGroups.map(g =>
      g.id === groupId ? { ...g, subjects: g.subjects.filter(s => s.id !== subjectId) } : g
    ));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold flex-1">Manage Subjects</h1>
        <Button size="sm" onClick={startAddGroup} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add Group
        </Button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-24">

        {/* Add group form */}
        {(addingGroup || editingGroupId) && (
          <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
            <p className="text-sm font-semibold">{addingGroup ? "New Subject Group" : "Edit Group"}</p>
            <div className="flex gap-2">
              <div className="space-y-1 w-20">
                <Label className="text-xs">Emoji</Label>
                <Input value={groupForm.emoji} onChange={e => setGroupForm(f => ({ ...f, emoji: e.target.value }))}
                  className="h-8 text-center text-lg" maxLength={4} placeholder="📚" />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Group Name *</Label>
                <Input value={groupForm.label} onChange={e => setGroupForm(f => ({ ...f, label: e.target.value }))}
                  className="h-8 text-sm" placeholder="e.g. Medicine, Surgery…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_COLOR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setGroupForm(f => ({ ...f, color: c }))}
                    className={`w-6 h-6 rounded-full transition-all ${COLOR_SWATCH[c]} ${
                      groupForm.color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "opacity-70 hover:opacity-100"
                    }`} title={c} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1"
                onClick={() => { setAddingGroup(false); setEditingGroupId(null); }}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" disabled={!groupForm.label.trim()} onClick={commitGroup}>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                {addingGroup ? "Create Group" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

        {customGroups.length === 0 && !addingGroup && (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <p className="text-sm font-medium text-muted-foreground">No custom subject groups yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Group" to create your first subject group.</p>
          </div>
        )}

        {customGroups.map(g => {
          const styles = CUSTOM_COLOR_STYLES[g.color] ?? CUSTOM_COLOR_STYLES.blue;
          const isExpanded = expandedId === g.id;
          const isEditingThis = editingGroupId === g.id;

          return (
            <div key={g.id} className={`rounded-xl border overflow-hidden ${styles.card}`}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="text-xl">{g.emoji}</span>
                <span className={`font-semibold text-sm flex-1 ${styles.text}`}>{g.label}</span>
                <span className="text-xs text-muted-foreground">{g.subjects.length} topic{g.subjects.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEditGroup(g)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {deleteConfirm === g.id ? (
                    <>
                      <button onClick={() => deleteGroup(g.id)}
                        className="h-7 px-2 text-xs rounded-lg bg-red-500 text-white font-medium">Delete?</button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-black/10">
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(g.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => setExpandedId(isExpanded ? null : g.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Subjects list */}
              {isExpanded && (
                <div className="border-t border-current/10 px-3 py-2 space-y-1.5 bg-background/60">
                  {g.subjects.map(s => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      {editingSubject?.groupId === g.id && editingSubject.subjectId === s.id ? (
                        <>
                          <Input value={subjectForm.label}
                            onChange={e => setSubjectForm({ label: e.target.value })}
                            className="h-7 text-xs flex-1" autoFocus
                            onKeyDown={e => { if (e.key === "Enter") commitSubject(); if (e.key === "Escape") setEditingSubject(null); }} />
                          <button onClick={commitSubject} className="h-7 w-7 flex items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingSubject(null)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm flex-1 font-medium">{s.label}</span>
                          <button onClick={() => startEditSubject(g.id, s)}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => deleteSubject(g.id, s.id)}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add subject form */}
                  {addingSubjectToGroupId === g.id ? (
                    <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
                      <Input value={subjectForm.label}
                        onChange={e => setSubjectForm({ label: e.target.value })}
                        className="h-7 text-xs flex-1" placeholder="Subject name…" autoFocus
                        onKeyDown={e => { if (e.key === "Enter") commitSubject(); if (e.key === "Escape") setAddingSubjectToGroupId(null); }} />
                      <button onClick={commitSubject} className="h-7 w-7 flex items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setAddingSubjectToGroupId(null)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startAddSubject(g.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-dashed">
                      <Plus className="h-3.5 w-3.5" /> Add Sub-topic
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

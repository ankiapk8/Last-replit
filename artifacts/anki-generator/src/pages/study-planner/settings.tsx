import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Settings as SettingsIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Status, Priority } from "@/lib/study-planner/topics";

function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }

export default function SPSettings() {
  const [, nav] = useLocation();
  const [displayName, setDisplayName] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<Status>("Not Started");
  const [defaultPriority, setDefaultPriority] = useState<Priority>("Medium");
  const [spacingDays, setSpacingDays] = useState(14);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(lsGet("sp-settings-display-name") ?? "");
    setDefaultStatus((lsGet("sp-settings-default-status") as Status) ?? "Not Started");
    setDefaultPriority((lsGet("sp-settings-default-priority") as Priority) ?? "Medium");
    setSpacingDays(parseInt(lsGet("sp-schedule-spacing-days") ?? "14", 10) || 14);
  }, []);

  const handleSave = () => {
    lsSet("sp-settings-display-name", displayName);
    lsSet("sp-settings-default-status", defaultStatus);
    lsSet("sp-settings-default-priority", defaultPriority);
    lsSet("sp-schedule-spacing-days", String(spacingDays));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const SectionHeader = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <SettingsIcon className="h-5 w-5 text-primary" />
        <h1 className="text-base font-semibold">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
        {/* Display */}
        <div>
          <SectionHeader label="Display" />
          <div className="space-y-2">
            <Label htmlFor="sp-display-name">Display Name</Label>
            <Input
              id="sp-display-name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Dr. Ahmed"
            />
            <p className="text-xs text-muted-foreground">Shown in the planner header instead of "Student".</p>
          </div>
        </div>

        {/* New Topic Defaults */}
        <div>
          <SectionHeader label="New Topic Defaults" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Status</Label>
              <Select value={defaultStatus} onValueChange={v => setDefaultStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Not Started", "In Progress", "Done", "Revised"] as Status[]).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Priority</Label>
              <Select value={defaultPriority} onValueChange={v => setDefaultPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Low", "Medium", "High"] as Priority[]).map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div>
          <SectionHeader label="Schedule" />
          <div className="space-y-2">
            <Label htmlFor="sp-spacing">Spacing Days (days between 1st & 2nd study)</Label>
            <Input
              id="sp-spacing"
              type="number"
              min={1}
              max={365}
              value={spacingDays}
              onChange={e => setSpacingDays(parseInt(e.target.value) || 14)}
            />
          </div>
        </div>

        <Button onClick={handleSave} className="w-full">
          {saved ? (
            <><Check className="h-4 w-4 mr-2" /> Saved!</>
          ) : (
            "Save Preferences"
          )}
        </Button>
      </div>
    </div>
  );
}

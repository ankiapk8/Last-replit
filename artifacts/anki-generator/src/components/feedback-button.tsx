import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, X, Star, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/utils";
import { useLocation } from "wouter";

type FeedbackType = "bug" | "suggestion" | "compliment" | "general";

const TYPE_OPTIONS: { value: FeedbackType; label: string; emoji: string }[] = [
  { value: "bug",        label: "Bug",        emoji: "🐛" },
  { value: "suggestion", label: "Idea",        emoji: "💡" },
  { value: "compliment", label: "Compliment",  emoji: "🙏" },
  { value: "general",    label: "General",     emoji: "💬" },
];

export function FeedbackButton() {
  const [open, setOpen]           = useState(false);
  const [type, setType]           = useState<FeedbackType>("general");
  const [rating, setRating]       = useState<number>(0);
  const [hoverRating, setHover]   = useState<number>(0);
  const [message, setMessage]     = useState("");
  const [contact, setContact]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [location] = useLocation();

  const reset = () => {
    setType("general"); setRating(0); setHover(0);
    setMessage(""); setContact(""); setError(null); setDone(false);
  };

  const close = () => { setOpen(false); setTimeout(reset, 300); };

  const submit = async () => {
    if (!message.trim()) { setError("Please write a message."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("api/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          rating: rating || undefined,
          message: message.trim(),
          email: contact.trim() || undefined,
          page: location,
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setDone(true);
      setTimeout(close, 2200);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <>
      {/* Floating trigger */}
      <motion.button
        onClick={() => setOpen(true)}
        title="Send feedback"
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.93 }}
        className="fixed bottom-20 right-4 lg:bottom-6 z-40 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center hover:bg-primary/90 transition-colors"
      >
        <MessageSquarePlus className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
      </motion.button>

      {/* Backdrop + modal */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50"
              onClick={close}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{   opacity: 0, y: 16,  scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="fixed bottom-4 right-4 z-50 w-[clamp(300px,90vw,400px)] bg-background border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="font-semibold text-sm">Send Feedback</span>
                </div>
                <button onClick={close}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center"
                  >
                    <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-7 w-7 text-green-500" />
                    </div>
                    <p className="font-semibold text-sm">Thanks for the feedback!</p>
                    <p className="text-xs text-muted-foreground">We read every response and use it to improve AnkiGen.</p>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="p-4 space-y-4">
                    {/* Type selector */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {TYPE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setType(opt.value)}
                          className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                            type === opt.value
                              ? "border-primary/50 bg-primary/8 text-primary"
                              : "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span className="text-base leading-none">{opt.emoji}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Star rating */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">How's your experience?</p>
                      <div className="flex gap-1"
                        onMouseLeave={() => setHover(0)}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n}
                            onClick={() => setRating(n === rating ? 0 : n)}
                            onMouseEnter={() => setHover(n)}
                            className="transition-transform hover:scale-110 active:scale-95"
                          >
                            <Star
                              className="h-6 w-6 transition-colors"
                              fill={n <= displayRating ? "#f59e0b" : "transparent"}
                              stroke={n <= displayRating ? "#f59e0b" : "currentColor"}
                              strokeOpacity={n <= displayRating ? 1 : 0.35}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">Your message <span className="text-destructive">*</span></p>
                      <textarea
                        value={message}
                        onChange={e => { setMessage(e.target.value); setError(null); }}
                        placeholder={
                          type === "bug"        ? "Describe what went wrong..." :
                          type === "suggestion" ? "Share your idea..." :
                          type === "compliment" ? "What do you love?" :
                          "What's on your mind?"
                        }
                        rows={3}
                        className="w-full resize-none rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* Contact */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">Email or user ID <span className="text-muted-foreground/50 font-normal">(optional, for follow-up)</span></p>
                      <input
                        type="text"
                        value={contact}
                        onChange={e => setContact(e.target.value)}
                        placeholder="you@example.com or your username"
                        className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}

                    <Button
                      onClick={submit}
                      disabled={loading || !message.trim()}
                      className="w-full gap-2 h-9"
                    >
                      {loading
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                        : <><Send className="h-3.5 w-3.5" /> Send Feedback</>
                      }
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

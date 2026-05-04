import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  iconColor: string;
  iconGlow: string;
  gradient: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export function PageHeader({ icon: Icon, iconColor, iconGlow, gradient, title, subtitle, action }: Props) {
  return (
    <motion.div
      className="flex items-start justify-between gap-4 flex-wrap"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3">
        <motion.div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ background: `${iconColor}22`, border: `1.5px solid ${iconColor}44` }}
          animate={{
            boxShadow: [
              "0 0 0px transparent",
              `0 0 18px ${iconGlow}`,
              "0 0 0px transparent",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </motion.div>

        <div>
          <h1
            className={`text-2xl sm:text-3xl font-serif font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent tracking-tight leading-tight`}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
}

import React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/* Shared editorial page header — serif title with terracotta icon tile */
export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, description, actions, className }) => (
  <div className={cn("flex items-start justify-between gap-4", className)}>
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h1 className="font-serif text-xl font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

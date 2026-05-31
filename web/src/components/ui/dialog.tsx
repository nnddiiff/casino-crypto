"use client";

import type * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

const Dialog = BaseDialog.Root;
const DialogClose = BaseDialog.Close;

/**
 * Контент модалки: затемнение + всплывающее окно. Мобильный — нижний лист (bottom-sheet) во всю
 * ширину; от sm — центрированная карточка. Контент скроллится, не обрезается (max-h + overflow).
 */
function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          "fixed z-50 flex max-h-[92vh] w-full flex-col overflow-y-auto bg-card text-card-foreground shadow-2xl ring-1 ring-foreground/10",
          // мобильный: нижний лист
          "inset-x-0 bottom-0 rounded-t-2xl",
          // десктоп: по центру
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn("font-heading text-lg font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose };

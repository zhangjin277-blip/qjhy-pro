"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PromptDialogProps {
  open: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  confirmText?: string;
  cancelText?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string) => void;
}

export function PromptDialog({
  open,
  title,
  placeholder,
  defaultValue = "",
  maxLength,
  confirmText = "确定",
  cancelText = "取消",
  onOpenChange,
  onConfirm,
}: PromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  function handleConfirm(): void {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!value.trim()}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

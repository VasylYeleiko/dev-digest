/* ConfirmDeleteModal — "are you sure?" for destructive deletes (skill, agent):
   title + consequence text, Cancel, a danger Delete, and the Modal's own ✕.
   Replaces window.confirm, which can't be styled, tested or i18n'd. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ConfirmDeleteModal({
  title,
  body,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={MODAL_WIDTH}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {t("confirmDelete.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} disabled={pending}>
            {pending ? t("confirmDelete.deleting") : t("confirmDelete.delete")}
          </Button>
        </div>
      }
    >
      <p style={s.body}>{body}</p>
    </Modal>
  );
}

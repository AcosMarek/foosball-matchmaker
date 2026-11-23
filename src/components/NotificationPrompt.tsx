import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Icon, PrimaryButton, TextButton } from "../ui";

const Dialog = styled.dialog`
  /* M3 basic dialog */
  width: min(24rem, calc(100vw - 2rem));
  padding: 1.5rem;
  border: none;
  border-radius: 28px;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--md-elevation-2);
  &::backdrop {
    background: rgba(0, 0, 0, 0.32);
  }
`;

const Headline = styled.h2`
  margin: 0.75rem 0 1rem;
  text-align: center;
`;

const Body = styled.p`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
`;

const Decline = styled(TextButton)`
  margin-right: auto;
  color: var(--md-sys-color-on-surface-variant);
`;

type Props = {
  onActivate: () => void;
  onDismiss: () => void;
  onSilence: () => void;
};

export const NotificationPrompt = ({ onActivate, onDismiss, onSilence }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() (rather than the open attribute) gives focus trapping, Escape
  // handling and top-layer stacking for free.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <Dialog
      ref={dialogRef}
      aria-labelledby="notification-prompt-title"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <Icon size={24} aria-hidden style={{ width: "100%" }}>
        notifications_active
      </Icon>
      <Headline id="notification-prompt-title">Turn on notifications?</Headline>
      <Body>
        Get pinged the moment a match starts on your table and when your game is ready — even
        when this tab is closed.
      </Body>
      <Actions>
        <Decline type="button" onClick={onSilence}>
          Don't remind me
        </Decline>
        <TextButton type="button" onClick={onDismiss}>
          Not now
        </TextButton>
        <PrimaryButton type="button" onClick={onActivate}>
          Turn on
        </PrimaryButton>
      </Actions>
    </Dialog>
  );
};

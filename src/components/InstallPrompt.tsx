import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Dialog, Icon, PrimaryButton, TextButton } from "../ui";

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

const Steps = styled.ol`
  margin: 0.9rem 0 0;
  padding-left: 1.25rem;
  display: grid;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface);
`;

const InlineIcon = styled(Icon)`
  vertical-align: -0.25em;
  color: var(--md-sys-color-primary);
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
  onDismiss: () => void;
  onSilence: () => void;
};

// Shown only on an iPhone or iPad that has the site open in a browser tab. iOS gives a
// tab no way to receive notifications, so there is nothing to turn on here: the app has
// to be added to the home screen first, and the usual notification prompt takes over once
// it is opened from there.
export const InstallPrompt = ({ onDismiss, onSilence }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() (rather than the open attribute) gives focus trapping, Escape
  // handling and top-layer stacking for free.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <Dialog
      ref={dialogRef}
      aria-labelledby="install-prompt-title"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <Icon size={24} aria-hidden style={{ width: "100%" }}>
        add_to_home_screen
      </Icon>
      <Headline id="install-prompt-title">Want match alerts on this device?</Headline>
      <Body>
        iPhones and iPads only deliver notifications to apps on the home screen. Adding this
        one takes a few seconds:
      </Body>
      <Steps>
        <li>
          Tap{" "}
          <InlineIcon size={18} aria-hidden>
            ios_share
          </InlineIcon>{" "}
          <strong>Share</strong> in your browser's toolbar.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Open <strong>Foosball</strong> from your home screen, sign in, and turn on
          notifications.
        </li>
      </Steps>
      <Actions>
        <Decline type="button" onClick={onSilence}>
          Don't remind me
        </Decline>
        <PrimaryButton type="button" onClick={onDismiss}>
          Got it
        </PrimaryButton>
      </Actions>
    </Dialog>
  );
};

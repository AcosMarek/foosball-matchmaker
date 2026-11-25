import { useState } from "react";
import styled from "@emotion/styled";
import { Button, TextButton } from "../ui";

// The way off a table. Deliberately the quietest thing on the page, at the very bottom:
// a line of small grey text that has to be looked for, with a second step before anything
// happens. Leaving is rare, and easily undone, but shouldn't happen by a stray tap.

const Footer = styled.footer`
  margin: 1.5rem 0 0.5rem;
  text-align: center;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--md-sys-color-on-surface-variant);
`;

const Quiet = styled.button`
  padding: 0.4rem 0.6rem;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  border-radius: var(--md-shape-small);
  &:hover {
    color: var(--md-sys-color-on-surface);
  }
  &:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
`;

const Confirm = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.6rem;
`;

const Question = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.25rem;
`;

type Props = {
  tableName: string;
  onLeave: () => Promise<void>;
};

export const LeaveTable = ({ tableName, onLeave }: Props) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const leave = async () => {
    setBusy(true);
    setStatus("");
    try {
      // On success the table is deselected and this footer goes away with it.
      await onLeave();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Couldn't leave the table: ${message}`);
      setBusy(false);
    }
  };

  return (
    <Footer>
      {confirming ? (
        <>
          <Question>
            Leave {tableName}? You'll stop getting its match alerts. Your rating and match
            history stay, and you can rejoin with the table's code.
          </Question>
          <Confirm>
            <Button type="button" onClick={() => void leave()} disabled={busy}>
              Leave table
            </Button>
            <TextButton type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Stay
            </TextButton>
          </Confirm>
          {status && <Question role="alert">{status}</Question>}
        </>
      ) : (
        <Quiet type="button" onClick={() => setConfirming(true)}>
          Leave {tableName}
        </Quiet>
      )}
    </Footer>
  );
};

import { useEffect, useState } from "react";
import { getTable } from "../api";
import { isValidTableCode, normalizeTableCode } from "../matchmaking";
import type { FoosballTable } from "../types";
import { Hint, Icon, Input, PrimaryButton, Row, TextButton } from "../ui";

type Props = {
  defaultExpanded: boolean;
  onJoin: (table: FoosballTable) => void;
};

export const AddTableByCode = ({ defaultExpanded, onJoin }: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-open the field whenever we fall back to the empty state (no table selected),
  // so first-timers and anyone who deselects always see a way in.
  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true);
    }
  }, [defaultExpanded]);

  const handleAdd = async () => {
    const normalized = normalizeTableCode(code);
    if (!isValidTableCode(normalized)) {
      setStatus("Enter a 6-character table code.");
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const table = await getTable(normalized);
      if (!table) {
        setStatus("No table found for that code.");
        return;
      }

      onJoin(table);
      setCode("");
      setStatus("");
      setExpanded(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Couldn't add table: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <TextButton type="button" onClick={() => setExpanded(true)}>
        <Icon size={18} aria-hidden>
          add
        </Icon>
        Add a table by code
      </TextButton>
    );
  }

  return (
    <>
      <Row>
        <Input
          placeholder="Table code"
          value={code}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Table code"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAdd();
            }
          }}
        />
        <PrimaryButton type="button" onClick={() => void handleAdd()} disabled={busy}>
          <Icon aria-hidden>add</Icon>
          Add
        </PrimaryButton>
      </Row>
      {status && <Hint>{status}</Hint>}
    </>
  );
};

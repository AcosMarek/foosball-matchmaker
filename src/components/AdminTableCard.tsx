import { useState } from "react";
import type { User } from "firebase/auth";
import { createTable } from "../api";
import { Eyebrow, Hint, Icon, Input, OutlinedCard, PrimaryButton, Row } from "../ui";

type Props = {
  user: User;
  onCreated: (code: string) => void;
};

export const AdminTableCard = ({ user, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus("Name can't be empty.");
      return;
    }

    try {
      const code = await createTable(user, trimmed);
      setName("");
      setStatus(`Added ${trimmed} · ${code}`);
      onCreated(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Couldn't add table: ${message}`);
    }
  };

  return (
    <OutlinedCard>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          shield_person
        </Icon>
        Admin
      </Eyebrow>
      <Row>
        <Input
          placeholder="New table name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <PrimaryButton type="button" onClick={handleCreate}>
          <Icon aria-hidden>add</Icon>
          Add
        </PrimaryButton>
      </Row>
      {status && <Hint>{status}</Hint>}
    </OutlinedCard>
  );
};

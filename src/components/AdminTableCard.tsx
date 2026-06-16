import { useState } from "react";
import type { User } from "firebase/auth";
import { createTable } from "../api";
import { Card, Hint, Input, PrimaryButton, Row } from "../ui";

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
      setStatus("Table name is required.");
      return;
    }

    try {
      const code = await createTable(user, trimmed);
      setName("");
      setStatus(`Created table ${trimmed} (${code}).`);
      onCreated(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Could not create table: ${message}`);
    }
  };

  return (
    <Card>
      <h2>Admin: add foosball table</h2>
      <Row>
        <Input
          placeholder="Table name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <PrimaryButton type="button" onClick={handleCreate}>
          Add table
        </PrimaryButton>
      </Row>
      <Hint>Codes are generated automatically as 6 characters.</Hint>
      {status && <Hint>{status}</Hint>}
    </Card>
  );
};

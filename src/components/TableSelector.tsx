import type { User } from "firebase/auth";
import { Card, Hint, Row, Select } from "../ui";
import type { FoosballTable } from "../types";

type Props = {
  user: User | null;
  tables: FoosballTable[];
  selectedTable: string;
  onSelect: (code: string) => void;
};

export const TableSelector = ({ user, tables, selectedTable, onSelect }: Props) => (
  <Card>
    <h2>Select table</h2>
    <Row>
      <Select value={selectedTable} onChange={(event) => onSelect(event.target.value)}>
        <option value="">Choose table</option>
        {tables.map((table) => (
          <option key={table.code} value={table.code}>
            {table.name} ({table.code})
          </option>
        ))}
      </Select>
    </Row>
    {!user && <Hint>Sign in to join a table and get notified when a match starts.</Hint>}
    {user && !selectedTable && (
      <Hint>Pick your table to get notified when someone starts a match.</Hint>
    )}
    {user && selectedTable && (
      <Hint>
        ✓ You’re on this table. You’ll get a browser notification when someone starts a match —
        make sure notifications are enabled above.
      </Hint>
    )}
  </Card>
);

import { AddTableByCode } from "./AddTableByCode";
import { Badge, Eyebrow, FilledCard, Icon, Row, Select } from "../ui";
import type { FoosballTable } from "../types";

type Props = {
  tables: FoosballTable[];
  selectedTable: string;
  memberCount: number;
  onSelect: (code: string) => void;
  onJoin: (table: FoosballTable) => void;
};

export const TableSelector = ({
  tables,
  selectedTable,
  memberCount,
  onSelect,
  onJoin,
}: Props) => (
  <FilledCard>
    <Eyebrow>
      <Icon size={16} aria-hidden>
        stadia_controller
      </Icon>
      Your table
    </Eyebrow>
    {(tables.length > 0 || selectedTable) && (
      <Row>
        <Select value={selectedTable} onChange={(event) => onSelect(event.target.value)}>
          <option value="">Choose a table…</option>
          {tables.map((table) => (
            <option key={table.code} value={table.code}>
              {table.name} ({table.code})
            </option>
          ))}
        </Select>
        {selectedTable && (
          <Badge>
            <Icon size={14} fill={1} aria-hidden>
              group
            </Icon>
            {memberCount} here
          </Badge>
        )}
      </Row>
    )}
    <AddTableByCode defaultExpanded={!selectedTable} onJoin={onJoin} />
  </FilledCard>
);

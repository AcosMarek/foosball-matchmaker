import styled from "@emotion/styled";
import { AddTableByCode } from "./AddTableByCode";
import { Badge, Eyebrow, FilledCard, Icon, Row, Select, TextButton } from "../ui";
import type { Departure, FoosballTable } from "../types";

const Notice = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: var(--md-shape-small);
  background: var(--md-sys-color-surface-container-lowest);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface);
  & > span {
    flex: 1 1 14rem;
  }
`;

type Props = {
  tables: FoosballTable[];
  selectedTable: string;
  memberCount: number;
  onSelect: (code: string) => void;
  onJoin: (table: FoosballTable) => void;
  // The table the player just left or was taken off, if any, so they can be told why it
  // is gone from the list and given a one-tap way back.
  departed: Departure | null;
  onDismissDeparted: () => void;
};

export const TableSelector = ({
  tables,
  selectedTable,
  memberCount,
  onSelect,
  onJoin,
  departed,
  onDismissDeparted,
}: Props) => (
  <FilledCard>
    <Eyebrow>
      <Icon size={16} aria-hidden>
        stadia_controller
      </Icon>
      Your table
    </Eyebrow>
    {departed && (
      <Notice role="status">
        <span>
          {departed.left
            ? `You left ${departed.table.name}. Its match alerts have stopped.`
            : `You're no longer on ${departed.table.name}, so its match alerts have stopped.`}
        </span>
        <TextButton type="button" onClick={() => onJoin(departed.table)}>
          Rejoin
        </TextButton>
        <TextButton type="button" onClick={onDismissDeparted}>
          OK
        </TextButton>
      </Notice>
    )}
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

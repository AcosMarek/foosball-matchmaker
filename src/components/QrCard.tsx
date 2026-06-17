import styled from "@emotion/styled";
import { Eyebrow, Icon, Mono, OutlinedCard } from "../ui";

const qrServiceUrl =
  import.meta.env.VITE_QR_SERVICE_URL || "https://api.qrserver.com/v1/create-qr-code/";

const Body = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const Qr = styled.img`
  width: 96px;
  height: 96px;
  border-radius: var(--md-shape-small);
  background: #ffffff;
  flex: none;
`;

const Text = styled.p`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.4rem;
  color: var(--md-sys-color-on-surface-variant);
`;

type Props = {
  selectedTable: string;
};

export const QrCard = ({ selectedTable }: Props) => {
  const target = `${window.location.origin}?table=${selectedTable}`;
  const qrUrl = `${qrServiceUrl}?size=180x180&data=${encodeURIComponent(target)}`;

  return (
    <OutlinedCard>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          qr_code_2
        </Icon>
        Invite
      </Eyebrow>
      <Body>
        <Qr alt={`QR code for table ${selectedTable}`} src={qrUrl} width={96} height={96} />
        <Text>
          Scan to jump straight onto <Mono>{selectedTable}</Mono>.
        </Text>
      </Body>
    </OutlinedCard>
  );
};

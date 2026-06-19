import { useState } from "react";
import styled from "@emotion/styled";
import { Button, Eyebrow, Icon, Mono, OutlinedCard } from "../ui";

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

const Info = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
`;

const FlyerButton = styled(Button.withComponent("a"))`
  text-decoration: none;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

type Props = {
  selectedTable: string;
};

export const QrCard = ({ selectedTable }: Props) => {
  const target = `${window.location.origin}?table=${selectedTable}`;
  const qrUrl = `${qrServiceUrl}?size=180x180&data=${encodeURIComponent(target)}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context or denied permission).
    }
  };

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
        <Info>
          <Text>
            Scan to jump straight onto <Mono>{selectedTable}</Mono>.
          </Text>
          <Actions>
            <Button type="button" onClick={handleCopy}>
              <Icon size={18} aria-hidden>
                {copied ? "check" : "link"}
              </Icon>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <FlyerButton
              href={`/flier/index.html?table=${encodeURIComponent(selectedTable)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon size={18} aria-hidden>
                print
              </Icon>
              Printable flyer
            </FlyerButton>
          </Actions>
        </Info>
      </Body>
    </OutlinedCard>
  );
};

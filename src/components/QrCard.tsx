import { Card } from "../ui";

const qrServiceUrl =
  import.meta.env.VITE_QR_SERVICE_URL || "https://api.qrserver.com/v1/create-qr-code/";

type Props = {
  selectedTable: string;
};

export const QrCard = ({ selectedTable }: Props) => {
  const target = `${window.location.origin}?table=${selectedTable}`;
  const qrUrl = `${qrServiceUrl}?size=220x220&data=${encodeURIComponent(target)}`;

  return (
    <Card>
      <h2>QR code for this table</h2>
      <p>
        Share this code in the building so anyone can scan and join quickly: <b>{selectedTable}</b>
      </p>
      <img alt={`QR code for table ${selectedTable}`} src={qrUrl} width={220} height={220} />
    </Card>
  );
};

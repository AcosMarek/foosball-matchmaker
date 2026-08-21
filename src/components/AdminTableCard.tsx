import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import { createTable, getTableSlackWebhook, isSlackWebhookUrl, setTableSlackWebhook } from "../api";
import {
  Badge,
  Eyebrow,
  Hint,
  Icon,
  Input,
  OutlinedCard,
  PrimaryButton,
  Row,
  TextButton,
} from "../ui";

type Props = {
  user: User;
  selectedTable: string;
  selectedTableName: string;
  onCreated: (code: string) => void;
};

const Section = styled.div`
  margin-top: 1.1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--md-sys-color-outline-variant);
`;

const GrowInput = styled(Input)`
  flex: 1 1 14rem;
  min-width: 0;
`;

// Identify which hook is wired up without putting the secret back on screen.
const webhookTail = (url: string): string => `…${url.slice(-6)}`;

export const AdminTableCard = ({ user, selectedTable, selectedTableName, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [webhook, setWebhook] = useState("");
  const [savedWebhook, setSavedWebhook] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWebhook("");
    setWebhookStatus("");
    setSavedWebhook("");
    if (!selectedTable) {
      return;
    }

    let cancelled = false;
    getTableSlackWebhook(selectedTable)
      .then((url) => {
        if (!cancelled) {
          setSavedWebhook(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWebhookStatus("Couldn't load the Slack setting.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTable]);

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

  const saveWebhook = async (url: string) => {
    setBusy(true);
    try {
      await setTableSlackWebhook(user, selectedTable, url);
      setSavedWebhook(url);
      setWebhook("");
      setWebhookStatus(url ? "Slack connected." : "Slack disconnected.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWebhookStatus(`Couldn't save: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () => {
    const trimmed = webhook.trim();
    if (!isSlackWebhookUrl(trimmed)) {
      setWebhookStatus("Paste an Incoming Webhook URL from hooks.slack.com.");
      return;
    }

    void saveWebhook(trimmed);
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

      {selectedTable && (
        <Section>
          <Eyebrow>
            <Icon size={16} aria-hidden>
              forum
            </Icon>
            Slack · {selectedTableName}
            {savedWebhook && <Badge>Connected</Badge>}
          </Eyebrow>
          <Row>
            <GrowInput
              type="url"
              placeholder="https://hooks.slack.com/services/…"
              value={webhook}
              autoComplete="off"
              spellCheck={false}
              aria-label="Slack incoming webhook URL"
              onChange={(event) => setWebhook(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleConnect();
                }
              }}
            />
            <PrimaryButton type="button" onClick={handleConnect} disabled={busy}>
              <Icon aria-hidden>link</Icon>
              {savedWebhook ? "Replace" : "Connect"}
            </PrimaryButton>
            {savedWebhook && (
              <TextButton type="button" onClick={() => void saveWebhook("")} disabled={busy}>
                Remove
              </TextButton>
            )}
          </Row>
          <Hint>
            {savedWebhook
              ? `Posting matchmaking and "Game on!" alerts to ${webhookTail(savedWebhook)}.`
              : 'Add an Incoming Webhook to post matchmaking and "Game on!" alerts to a channel.'}
          </Hint>
          {webhookStatus && <Hint>{webhookStatus}</Hint>}
        </Section>
      )}
    </OutlinedCard>
  );
};

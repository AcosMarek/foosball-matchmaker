import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import {
  createTable,
  getTableReach,
  getTableSlackWebhook,
  isSlackWebhookUrl,
  removeFromTable,
  setTableSlackWebhook,
} from "../api";
import {
  Badge,
  Eyebrow,
  Hint,
  Icon,
  IconButton,
  Input,
  OutlinedCard,
  PrimaryButton,
  Row,
  TextButton,
  TonalButton,
} from "../ui";
import type { TableReach } from "../../api/_lib/members";

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

const Members = styled.ul`
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
`;

const Member = styled.li`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  & + & {
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
`;

const Who = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  & small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--md-sys-color-on-surface-variant);
  }
`;

// The question asked before removing someone. Unlike a name it must never be cut short.
const Ask = styled(Who)`
  white-space: normal;
  & small {
    white-space: normal;
  }
`;

const Reach = styled.span<{ on: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  color: ${(props) =>
    props.on ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)"};
`;

const formatDay = (ms: number): string =>
  new Date(ms).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

// Identify which hook is wired up without putting the secret back on screen.
const webhookTail = (url: string): string => `…${url.slice(-6)}`;

export const AdminTableCard = ({ user, selectedTable, selectedTableName, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [webhook, setWebhook] = useState("");
  const [savedWebhook, setSavedWebhook] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // Who this table's alerts reach. Loaded on request, never on its own: it is a list of
  // names, and most visits to this card are not about it.
  const [reach, setReach] = useState<TableReach | null>(null);
  const [reachStatus, setReachStatus] = useState("");
  const [reachBusy, setReachBusy] = useState(false);

  // The player an admin has tapped "remove" on; removing takes a second, explicit tap.
  const [removing, setRemoving] = useState("");

  const loadReach = async () => {
    setReachBusy(true);
    setReachStatus("");
    try {
      setReach(await getTableReach(user, selectedTable));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReachStatus(`Couldn't load the list: ${message}`);
    } finally {
      setReachBusy(false);
    }
  };

  const removeMember = async (uid: string, displayName: string) => {
    setReachBusy(true);
    setReachStatus("");
    try {
      setReach(await removeFromTable(user, selectedTable, uid));
      setReachStatus(`${displayName} is off ${selectedTableName}. They can rejoin with the code.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReachStatus(`Couldn't remove ${displayName}: ${message}`);
    } finally {
      setRemoving("");
      setReachBusy(false);
    }
  };

  useEffect(() => {
    setWebhook("");
    setWebhookStatus("");
    setSavedWebhook("");
    setReach(null);
    setReachStatus("");
    setRemoving("");
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

      {selectedTable && (
        <Section>
          <Eyebrow>
            <Icon size={16} aria-hidden>
              notifications_active
            </Icon>
            Match alerts · {selectedTableName}
            {reach && (
              <Badge>
                {reach.reachable} of {reach.registered} reached
              </Badge>
            )}
          </Eyebrow>
          <Row>
            <TonalButton type="button" onClick={() => void loadReach()} disabled={reachBusy}>
              <Icon aria-hidden>{reach ? "refresh" : "group"}</Icon>
              {reach ? "Refresh" : "Show who gets pinged"}
            </TonalButton>
          </Row>
          {reach && (
            <>
              <Hint>
                {reach.registered === 0
                  ? "Nobody is registered on this table yet."
                  : `${reach.reachable} of the ${reach.registered} players registered here get a push when a match starts. "Off" means no device of theirs is signed up: they never turned notifications on, or the sign-up has expired. Whoever starts a match isn't pinged about it.`}
              </Hint>
              <Members>
                {reach.members.map((member) =>
                  removing === member.uid ? (
                    <Member key={member.uid}>
                      <Ask>
                        Remove {member.displayName} from {selectedTableName}?
                        <small>Only this table. They can rejoin with its code.</small>
                      </Ask>
                      <TextButton
                        type="button"
                        disabled={reachBusy}
                        onClick={() => void removeMember(member.uid, member.displayName)}
                      >
                        Remove
                      </TextButton>
                      <TextButton type="button" disabled={reachBusy} onClick={() => setRemoving("")}>
                        Keep
                      </TextButton>
                    </Member>
                  ) : (
                    <Member key={member.uid}>
                      <Who>
                        {member.displayName}
                        {member.email && <small>{member.email}</small>}
                      </Who>
                      <Reach
                        on={member.devices > 0}
                        title={
                          member.lastRegistered
                            ? `Last signed up ${formatDay(member.lastRegistered)}`
                            : undefined
                        }
                      >
                        <Icon size={18} fill={member.devices > 0 ? 1 : 0} aria-hidden>
                          {member.devices > 0 ? "notifications_active" : "notifications_off"}
                        </Icon>
                        {member.devices === 0
                          ? "Off"
                          : `On · ${member.devices} device${member.devices === 1 ? "" : "s"}`}
                      </Reach>
                      <IconButton
                        type="button"
                        title={`Remove ${member.displayName} from this table`}
                        aria-label={`Remove ${member.displayName} from this table`}
                        disabled={reachBusy}
                        onClick={() => setRemoving(member.uid)}
                      >
                        <Icon size={20} aria-hidden>
                          person_remove
                        </Icon>
                      </IconButton>
                    </Member>
                  ),
                )}
              </Members>
            </>
          )}
          {reachStatus && <Hint>{reachStatus}</Hint>}
        </Section>
      )}
    </OutlinedCard>
  );
};

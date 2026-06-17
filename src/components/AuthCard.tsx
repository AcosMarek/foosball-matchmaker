import { useState } from "react";
import { signInWithPopup, signOut, type User } from "firebase/auth";
import styled from "@emotion/styled";
import { auth, googleAuthProvider } from "../firebase";
import { Avatar, Card, Icon, IconButton, PrimaryButton, RodMark } from "../ui";

const notificationsSupported = typeof Notification !== "undefined";

type NotificationState = NotificationPermission | "unsupported";

const Identity = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`;

const Name = styled.span`
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  @media (max-width: 480px) {
    display: none;
  }
`;

const initialOf = (user: User): string =>
  (user.displayName || user.email || "?").trim().charAt(0).toUpperCase();

export const AuthBar = ({ user }: { user: User }) => {
  const [permission, setPermission] = useState<NotificationState>(
    notificationsSupported ? Notification.permission : "unsupported",
  );

  const requestNotifications = async () => {
    if (!notificationsSupported) {
      return;
    }

    setPermission(await Notification.requestPermission());
  };

  const bellIcon =
    permission === "granted"
      ? "notifications_active"
      : permission === "denied"
        ? "notifications_off"
        : "notifications";
  const bellLabel =
    permission === "granted"
      ? "Notifications on"
      : permission === "denied"
        ? "Notifications blocked"
        : permission === "unsupported"
          ? "Notifications unsupported"
          : "Turn on notifications";

  return (
    <Identity>
      <IconButton
        type="button"
        title={bellLabel}
        aria-label={bellLabel}
        disabled={permission !== "default"}
        onClick={requestNotifications}
      >
        <Icon fill={permission === "granted" ? 1 : 0} aria-hidden>
          {bellIcon}
        </Icon>
      </IconButton>
      <Avatar>
        {user.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          initialOf(user)
        )}
      </Avatar>
      <Name>{user.displayName || user.email}</Name>
      <IconButton type="button" title="Sign out" aria-label="Sign out" onClick={() => signOut(auth)}>
        <Icon aria-hidden>logout</Icon>
      </IconButton>
    </Identity>
  );
};

const Hero = styled(Card)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.1rem;
`;

const HeroText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const HeroTitle = styled.h1`
  margin: 0;
  font-size: 1.75rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--md-sys-color-on-surface);
`;

const HeroSub = styled.p`
  margin: 0;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface-variant);
`;

export const SignInPanel = () => (
  <Hero>
    <RodMark size={40} />
    <HeroText>
      <HeroTitle>Ready to play?</HeroTitle>
      <HeroSub>Start a match and everyone on your table gets pinged.</HeroSub>
    </HeroText>
    <PrimaryButton type="button" onClick={() => signInWithPopup(auth, googleAuthProvider)}>
      <Icon aria-hidden>login</Icon>
      Continue with Google
    </PrimaryButton>
  </Hero>
);

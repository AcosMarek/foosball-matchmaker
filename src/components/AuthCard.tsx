import { useState } from "react";
import { signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleAuthProvider } from "../firebase";
import { Button, Card, PrimaryButton, Row } from "../ui";

const notificationsSupported = typeof Notification !== "undefined";

type NotificationState = NotificationPermission | "unsupported";

type Props = {
  user: User | null;
};

export const AuthCard = ({ user }: Props) => {
  const [permission, setPermission] = useState<NotificationState>(
    notificationsSupported ? Notification.permission : "unsupported",
  );

  const requestNotifications = async () => {
    if (!notificationsSupported) {
      return;
    }

    setPermission(await Notification.requestPermission());
  };

  if (!user) {
    return (
      <Card>
        <PrimaryButton type="button" onClick={() => signInWithPopup(auth, googleAuthProvider)}>
          Sign in with Google
        </PrimaryButton>
      </Card>
    );
  }

  const notificationsButton =
    permission === "default" ? (
      <Button type="button" onClick={requestNotifications}>
        Enable browser notifications
      </Button>
    ) : (
      <Button type="button" disabled>
        {permission === "granted"
          ? "Notifications enabled"
          : permission === "denied"
            ? "Notifications blocked"
            : "Notifications unsupported"}
      </Button>
    );

  return (
    <Card>
      <p>Signed in as {user.displayName || user.email}</p>
      <Row>
        {notificationsButton}
        <Button type="button" onClick={() => signOut(auth)}>
          Sign out
        </Button>
      </Row>
    </Card>
  );
};

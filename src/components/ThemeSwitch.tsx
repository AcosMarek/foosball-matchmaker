import styled from "@emotion/styled";
import { useThemeChoice, type ThemeChoice } from "../theme";
import { Icon } from "../ui";

// Light, dark, or whatever the device uses. A setting, not an action, so it sits quietly
// at the foot of the page.

const Group = styled.div`
  display: flex;
  justify-content: center;
  margin: 2rem 0 0;
`;

const Options = styled.div`
  display: inline-flex;
  padding: 2px;
  border-radius: var(--md-shape-full);
  border: 1px solid var(--md-sys-color-outline-variant);
`;

const Option = styled.button<{ selected: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.75rem;
  border: none;
  border-radius: var(--md-shape-full);
  font: inherit;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  cursor: pointer;
  background: ${(props) =>
    props.selected ? "var(--md-sys-color-secondary-container)" : "transparent"};
  color: ${(props) =>
    props.selected
      ? "var(--md-sys-color-on-secondary-container)"
      : "var(--md-sys-color-on-surface-variant)"};
  &:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
`;

const CHOICES: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "system", label: "Auto", icon: "brightness_auto" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
];

export const ThemeSwitch = () => {
  const [choice, choose] = useThemeChoice();

  return (
    <Group>
      <Options role="group" aria-label="Colour theme">
        {CHOICES.map(({ value, label, icon }) => (
          <Option
            key={value}
            type="button"
            selected={choice === value}
            aria-pressed={choice === value}
            onClick={() => choose(value)}
          >
            <Icon size={16} aria-hidden>
              {icon}
            </Icon>
            {label}
          </Option>
        ))}
      </Options>
    </Group>
  );
};

import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";

export const GlobalStyles = () => (
  <Global
    styles={css`
      :root {
        /* Material 3 color scheme — light, green seed */
        --md-sys-color-primary: #386a20;
        --md-sys-color-on-primary: #ffffff;
        --md-sys-color-primary-container: #b7f397;
        --md-sys-color-on-primary-container: #042100;
        --md-sys-color-secondary: #55624c;
        --md-sys-color-on-secondary: #ffffff;
        --md-sys-color-secondary-container: #d9e7cb;
        --md-sys-color-on-secondary-container: #131f0d;
        --md-sys-color-tertiary: #19686a;
        --md-sys-color-on-tertiary: #ffffff;
        --md-sys-color-tertiary-container: #bcebec;
        --md-sys-color-on-tertiary-container: #002021;
        --md-sys-color-error: #ba1a1a;
        --md-sys-color-on-error: #ffffff;
        --md-sys-color-error-container: #ffdad6;
        --md-sys-color-on-error-container: #410002;
        --md-sys-color-background: #edf1ea;
        --md-sys-color-on-background: #191d17;
        --md-sys-color-surface: #edf1ea;
        --md-sys-color-on-surface: #191d17;
        --md-sys-color-surface-variant: #dde5d8;
        --md-sys-color-on-surface-variant: #424940;
        --md-sys-color-outline: #72796d;
        --md-sys-color-outline-variant: #c2c9bc;
        --md-sys-color-surface-container-lowest: #ffffff;
        --md-sys-color-surface-container-low: #f7faf4;
        --md-sys-color-surface-container: #f1f5ee;
        --md-sys-color-surface-container-high: #ebefe8;
        --md-sys-color-surface-container-highest: #e6eae3;

        /* App accent — amber, used for countdown warnings */
        --app-warning: #815600;

        /* State layers */
        --md-state-on-primary-08: rgba(255, 255, 255, 0.08);
        --md-state-on-primary-12: rgba(255, 255, 255, 0.12);
        --md-state-primary-08: rgba(56, 106, 32, 0.08);
        --md-state-primary-12: rgba(56, 106, 32, 0.12);
        --md-state-disabled-bg: rgba(26, 28, 24, 0.12);
        --md-state-disabled-content: rgba(26, 28, 24, 0.38);

        /* Elevation */
        --md-elevation-1: 0 1px 2px rgba(0, 0, 0, 0.2), 0 1px 3px 1px rgba(0, 0, 0, 0.1);
        --md-elevation-2: 0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 6px 2px rgba(0, 0, 0, 0.12);

        /* Shape scale */
        --md-shape-small: 8px;
        --md-shape-medium: 12px;
        --md-shape-large: 16px;
        --md-shape-full: 9999px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
        color: var(--md-sys-color-on-surface);
        background: var(--md-sys-color-background);
      }

      h2 {
        /* M3 title-large */
        font-size: 1.375rem;
        line-height: 1.75rem;
        font-weight: 500;
        letter-spacing: 0;
        margin: 0 0 0.75rem;
        color: var(--md-sys-color-on-surface);
      }
    `}
  />
);

export const Wrapper = styled.main`
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
`;

export const Header = styled.header`
  text-align: center;
  margin-bottom: 1.5rem;
`;

export const Title = styled.h1`
  /* M3 display-small */
  margin: 0;
  font-size: 2.25rem;
  line-height: 2.75rem;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--md-sys-color-on-surface);
`;

export const Subtitle = styled.p`
  /* M3 body-large */
  margin: 0.5rem 0 0;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface-variant);
`;

export const Card = styled.section`
  /* M3 elevated card */
  background: var(--md-sys-color-surface-container-lowest);
  border: none;
  border-radius: var(--md-shape-large);
  padding: 1.25rem 1.4rem;
  margin-bottom: 1rem;
  box-shadow: var(--md-elevation-1);
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
`;

export const Input = styled.input`
  /* M3 outlined text field */
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-shape-small);
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-lowest);
  &::placeholder {
    color: var(--md-sys-color-on-surface-variant);
  }
  &:hover:not(:focus):not(:disabled) {
    border-color: var(--md-sys-color-on-surface);
  }
  &:focus {
    outline: none;
    border-color: var(--md-sys-color-primary);
    box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
  }
`;

export const Select = styled.select`
  /* M3 outlined text field */
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-shape-small);
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-lowest);
  cursor: pointer;
  &:hover:not(:focus):not(:disabled) {
    border-color: var(--md-sys-color-on-surface);
  }
  &:focus {
    outline: none;
    border-color: var(--md-sys-color-primary);
    box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
  }
`;

export const Button = styled.button`
  /* M3 outlined button */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0 1.5rem;
  border: 1px solid var(--md-sys-color-outline);
  background: transparent;
  color: var(--md-sys-color-primary);
  border-radius: var(--md-shape-full);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.1px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s;
  &:hover:not(:disabled) {
    background-color: var(--md-state-primary-08);
  }
  &:focus-visible {
    outline: none;
    background-color: var(--md-state-primary-12);
  }
  &:active:not(:disabled) {
    background-color: var(--md-state-primary-12);
  }
  &:disabled {
    cursor: not-allowed;
    color: var(--md-state-disabled-content);
    border-color: var(--md-state-disabled-bg);
    background: transparent;
  }
`;

export const PrimaryButton = styled(Button)`
  /* M3 filled button */
  background-color: var(--md-sys-color-primary);
  border-color: transparent;
  color: var(--md-sys-color-on-primary);
  &:hover:not(:disabled) {
    background-color: var(--md-sys-color-primary);
    background-image: linear-gradient(var(--md-state-on-primary-08), var(--md-state-on-primary-08));
    box-shadow: var(--md-elevation-1);
  }
  &:focus-visible:not(:disabled) {
    background-color: var(--md-sys-color-primary);
    background-image: linear-gradient(var(--md-state-on-primary-12), var(--md-state-on-primary-12));
  }
  &:active:not(:disabled) {
    background-color: var(--md-sys-color-primary);
    background-image: linear-gradient(var(--md-state-on-primary-12), var(--md-state-on-primary-12));
    box-shadow: none;
  }
  &:disabled {
    background-color: var(--md-state-disabled-bg);
    background-image: none;
    border-color: transparent;
    color: var(--md-state-disabled-content);
    box-shadow: none;
  }
`;

export const Hint = styled.p`
  /* M3 body-medium */
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface-variant);
`;

export const Badge = styled.span`
  /* M3 tonal chip */
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: var(--md-shape-full);
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  letter-spacing: 0.1px;
`;

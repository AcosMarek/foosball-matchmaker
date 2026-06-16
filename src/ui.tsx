import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";

export const GlobalStyles = () => (
  <Global
    styles={css`
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #1f2933;
        background: radial-gradient(1100px 520px at 50% -8%, #d9f2e6 0%, rgba(217, 242, 230, 0) 60%),
          #eef2f5;
      }
      h2 {
        font-size: 1.15rem;
        margin: 0 0 0.6rem;
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
  margin: 0;
  font-size: 2.1rem;
  letter-spacing: -0.02em;
`;

export const Subtitle = styled.p`
  margin: 0.4rem 0 0;
  color: #5b6770;
`;

export const Card = styled.section`
  background: #ffffff;
  border: 1px solid #e6ebef;
  border-radius: 16px;
  padding: 1.25rem 1.4rem;
  margin-bottom: 1.1rem;
  box-shadow: 0 8px 24px rgba(20, 40, 60, 0.06);
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
`;

export const Input = styled.input`
  padding: 0.55rem 0.75rem;
  border: 1px solid #cdd6dd;
  border-radius: 10px;
  font-size: 0.95rem;
  &:focus {
    outline: none;
    border-color: #2e7d32;
    box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.18);
  }
`;

export const Select = styled.select`
  padding: 0.55rem 0.75rem;
  border: 1px solid #cdd6dd;
  border-radius: 10px;
  font-size: 0.95rem;
  background: #ffffff;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: #2e7d32;
    box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.18);
  }
`;

export const Button = styled.button`
  padding: 0.55rem 1rem;
  border: 1px solid #cdd6dd;
  background: #ffffff;
  color: #1f2933;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.04s, box-shadow 0.15s;
  &:hover:not(:disabled) {
    background: #f2f5f8;
    border-color: #b6c2cb;
  }
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const PrimaryButton = styled(Button)`
  background: #2e7d32;
  border-color: #2e7d32;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(46, 125, 50, 0.25);
  &:hover:not(:disabled) {
    background: #276b2a;
    border-color: #276b2a;
  }
`;

export const Hint = styled.p`
  margin: 0.5rem 0 0;
  color: #5b6770;
  font-size: 0.9rem;
`;

export const Badge = styled.span`
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: #eef2f5;
  border: 1px solid #e0e6ea;
  color: #3a4750;
  font-size: 0.78rem;
  font-weight: 600;
`;

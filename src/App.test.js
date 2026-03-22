import { render, screen } from '@testing-library/react';
import App from './App';

test('renders profile form', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /contact profile/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument();
});

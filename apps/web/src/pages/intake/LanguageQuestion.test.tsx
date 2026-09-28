import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../../test/headingStructure';
import { paths } from '../../routes/paths';
import { renderIntake, stubIntakeApi, TEST_VOCABULARY, userEvent } from '../../test/intakeRender';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  sessionStorage.clear();
});

async function openLanguageStep() {
  stubIntakeApi();
  return renderIntake(`${paths.intake}/language`);
}

describe('the language question', () => {
  it('asks in the words a person would use, not a language list', async () => {
    await openLanguageStep();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /what language would you feel most comfortable/i,
      }),
    ).toBeInTheDocument();
  });

  it('shows the common languages first, whatever order the service returns them in', async () => {
    // The service returns languages alphabetically, and the shortlist is only
    // useful if the order is the product's. A fixture already in the right order
    // cannot catch that being ignored, so this one is deliberately reversed.
    const alphabetical = [...TEST_VOCABULARY.languages].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    stubIntakeApi({ vocabulary: { ...TEST_VOCABULARY, languages: alphabetical } });
    await renderIntake(`${paths.intake}/language`);

    const group = screen.getByRole('group', {
      name: /what language would you feel most comfortable/i,
    });
    const shown = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent ?? '');

    // Alphabetical would be Bengali, English, French, Gujarati, Hindi…
    expect(shown.slice(0, 4)).toEqual([
      expect.stringContaining('English'),
      expect.stringContaining('Hindi'),
      expect.stringContaining('Bengali'),
      expect.stringContaining('Tamil'),
    ]);
  });

  it('shows the common languages first, and does not make everyone scroll for the rest', async () => {
    await openLanguageStep();

    const group = screen.getByRole('group', {
      name: /what language would you feel most comfortable/i,
    });
    const shown = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent ?? '');

    expect(shown).toHaveLength(8);
    expect(shown[0]).toContain('English');
    expect(shown[1]).toContain('Hindi');
    expect(shown).not.toContainEqual(expect.stringContaining('Swedish'));
  });

  it('offers every language one press away', async () => {
    await openLanguageStep();

    const toggle = screen.getByRole('button', { name: /show all 9 languages/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.setup().click(toggle);

    const group = screen.getByRole('group', {
      name: /what language would you feel most comfortable/i,
    });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(9);
    expect(screen.getByRole('button', { name: /show fewer/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('lets someone type instead of scrolling', async () => {
    await openLanguageStep();

    await userEvent.setup().type(screen.getByLabelText(/type to narrow the list/i), 'fren');

    const group = screen.getByRole('group', {
      name: /what language would you feel most comfortable/i,
    });
    const shown = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent ?? '');

    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('French');
    expect(screen.getByText('1 of 9 languages')).toBeInTheDocument();
  });

  it('matches on a code as well as a name, for someone who thinks in two-letter tags', async () => {
    await openLanguageStep();

    await userEvent.setup().type(screen.getByLabelText(/type to narrow the list/i), 'ta');

    const group = screen.getByRole('group', {
      name: /what language would you feel most comfortable/i,
    });

    expect(
      within(group)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent ?? ''),
    ).toContainEqual(expect.stringContaining('Tamil'));
  });

  it('says so when nothing matches, rather than showing an empty list', async () => {
    await openLanguageStep();

    await userEvent.setup().type(screen.getByLabelText(/type to narrow the list/i), 'zzz');

    expect(screen.getByText(/no language matches that/i)).toBeInTheDocument();
  });

  it('remembers a choice made before the list was expanded', async () => {
    await openLanguageStep();

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /English/ }));
    await userEvent.setup().click(screen.getByRole('button', { name: /show all 9 languages/i }));

    expect(screen.getByRole('checkbox', { name: /English/ })).toBeChecked();
  });

  it('lets someone choose more than one', async () => {
    await openLanguageStep();

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /English/ }));
    await userEvent.setup().click(screen.getByRole('checkbox', { name: /Hindi/ }));

    expect(screen.getByRole('checkbox', { name: /English/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Hindi/ })).toBeChecked();
  });

  it('will not continue without a language, and says why', async () => {
    await openLanguageStep();

    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/at least one language/i);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /what language would you feel most comfortable/i,
      }),
    ).toBeInTheDocument();
  });

  it('moves on once a language is chosen', async () => {
    await openLanguageStep();

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /English/ }));
    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /how would you prefer to have your sessions/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it('says how many are still hidden, for anyone who cannot see the list', async () => {
    await openLanguageStep();

    // The + is decorative and hidden from assistive technology; the count is not,
    // so the control announces how much is behind it.
    expect(screen.getByRole('button', { name: /show all 9 languages/i })).toHaveAccessibleName(
      'Show all 9 languages(1 more)',
    );
  });

  it('keeps a sound heading structure', async () => {
    await openLanguageStep();

    expectSoundHeadingStructure();
  });
});

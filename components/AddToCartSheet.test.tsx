// @vitest-environment jsdom
//
// Regression coverage for issue #187: AddToCartSheet used to render a
// hardcoded list of sizes (Small/Medium/Large) and add-ons (Extra Sauce,
// Double Portion, Extra Cheese, No Ice) for every menu item, ignoring the
// item's actual configured `customizations`. It now renders whatever sizes /
// add-ons / special-instructions toggle are configured on the MenuItem
// itself, and omits each section entirely when it has nothing configured.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { MenuItem } from '@/lib/menu';
import type { Session } from '@/lib/session';

const updateSession = vi.fn();

vi.mock('@/lib/session-context', () => ({
  useSession: () => ({
    session: mockSession,
    updateSession,
  }),
}));

// next/image requires a Next.js runtime/loader to fully function; under
// plain vitest+jsdom it renders fine as a plain <img> for our purposes, but
// we stub it to keep the test focused on this component's own logic and to
// avoid any build-time image-loader warnings.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

import AddToCartSheet from './AddToCartSheet';

let mockSession: Session;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'demo-table-1',
    userCounter: 0,
    baskets: [],
    orderStatus: 'building',
    paymentDeadline: null,
    paymentPlan: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    name: 'Test Burger',
    description: 'A test burger',
    imageUrl: 'https://cdn.example.com/burger.png',
    price: 9.99,
    dietaryTags: [],
    allergens: [],
    isAvailable: true,
    customizations: { sizes: [], addOns: [], specialInstructions: false },
    ...overrides,
  };
}

const noop = () => {};

afterEach(() => {
  cleanup();
  updateSession.mockClear();
  mockSession = makeSession();
});

mockSession = makeSession();

describe('AddToCartSheet customisation rendering (#187)', () => {
  it('renders configured sizes and add-ons with correctly formatted price deltas, and never the old hardcoded options', () => {
    const item = makeItem({
      customizations: {
        sizes: [
          { label: 'Large', priceDelta: 2 },
          { label: 'Family', priceDelta: 5 },
        ],
        addOns: [
          { label: 'Guacamole', priceDelta: 1.25 },
          { label: 'Sour Cream', priceDelta: 0.5 },
        ],
        specialInstructions: false,
      },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.getByText('Size')).toBeTruthy();
    expect(screen.getByText('Add-ons')).toBeTruthy();

    expect(screen.getByText('Large (+$2.00)')).toBeTruthy();
    expect(screen.getByText('Family (+$5.00)')).toBeTruthy();
    expect(screen.getByText('Guacamole (+$1.25)')).toBeTruthy();
    expect(screen.getByText('Sour Cream (+$0.50)')).toBeTruthy();

    // Old hardcoded strings must never appear when not configured.
    expect(screen.queryByText('Small')).toBeNull();
    expect(screen.queryByText('Medium')).toBeNull();
    expect(screen.queryByText(/Extra Sauce/)).toBeNull();
    expect(screen.queryByText(/Double Portion/)).toBeNull();
    expect(screen.queryByText(/Extra Cheese/)).toBeNull();
    expect(screen.queryByText(/No Ice/)).toBeNull();
  });

  it('renders only the size selector when the item has sizes but no add-ons', () => {
    const item = makeItem({
      customizations: {
        sizes: [{ label: 'Large', priceDelta: 2 }],
        addOns: [],
        specialInstructions: false,
      },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.getByText('Size')).toBeTruthy();
    expect(screen.getByText('Large (+$2.00)')).toBeTruthy();
    expect(screen.queryByText('Add-ons')).toBeNull();
  });

  it('renders only the add-ons list when the item has add-ons but no sizes', () => {
    const item = makeItem({
      customizations: {
        sizes: [],
        addOns: [{ label: 'Guacamole', priceDelta: 1.25 }],
        specialInstructions: false,
      },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.getByText('Add-ons')).toBeTruthy();
    expect(screen.getByText('Guacamole (+$1.25)')).toBeTruthy();
    expect(screen.queryByText('Size')).toBeNull();
  });

  it('renders neither Size nor Add-ons when the item has no customizations configured', () => {
    const item = makeItem({
      customizations: { sizes: [], addOns: [], specialInstructions: false },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.queryByText('Size')).toBeNull();
    expect(screen.queryByText('Add-ons')).toBeNull();
  });

  it('renders neither Size nor Add-ons when customizations is undefined', () => {
    const item = makeItem({ customizations: undefined });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.queryByText('Size')).toBeNull();
    expect(screen.queryByText('Add-ons')).toBeNull();
  });

  it('renders the Special Instructions section when specialInstructions is true', () => {
    const item = makeItem({
      customizations: { sizes: [], addOns: [], specialInstructions: true },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.getByText('Special Instructions')).toBeTruthy();
    expect(
      screen.getByPlaceholderText('e.g. no onions, extra spicy…')
    ).toBeTruthy();
  });

  it('omits the Special Instructions section when specialInstructions is false', () => {
    const item = makeItem({
      customizations: { sizes: [], addOns: [], specialInstructions: false },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.queryByText('Special Instructions')).toBeNull();
    expect(
      screen.queryByPlaceholderText('e.g. no onions, extra spicy…')
    ).toBeNull();
  });

  it('omits the Special Instructions section when the field is omitted entirely', () => {
    const item = makeItem({
      customizations: { sizes: [], addOns: [] },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    expect(screen.queryByText('Special Instructions')).toBeNull();
  });

  it('persists the selected size and add-on to the basket after completing the identity step', async () => {
    const item = makeItem({
      customizations: {
        sizes: [
          { label: 'Large', priceDelta: 2 },
          { label: 'Family', priceDelta: 5 },
        ],
        addOns: [
          { label: 'Guacamole', priceDelta: 1.25 },
          { label: 'Sour Cream', priceDelta: 0.5 },
        ],
        specialInstructions: false,
      },
    });

    render(
      <AddToCartSheet
        item={item}
        editBasketUserId={null}
        onClose={noop}
        onPass={noop}
        onFinish={noop}
      />
    );

    // Select the second size and one add-on.
    fireEvent.click(screen.getByText('Family (+$5.00)'));
    fireEvent.click(screen.getByText('Guacamole (+$1.25)'));

    fireEvent.click(screen.getByRole('button', { name: /Add Test Burger to basket/i }));

    // Sheet transitions (300ms) to the identity step.
    await waitFor(() => {
      expect(screen.getByText(/ordering/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Area code'), { target: { value: '416' } });
    fireEvent.change(screen.getByLabelText('Exchange'), { target: { value: '555' } });
    fireEvent.change(screen.getByLabelText('Subscriber number'), { target: { value: '0100' } });

    const identityAddButton = screen.getByRole('button', { name: 'Add to basket' }) as HTMLButtonElement;
    expect(identityAddButton.disabled).toBe(false);
    fireEvent.click(identityAddButton);

    await waitFor(() => {
      expect(updateSession).toHaveBeenCalled();
    });

    const finalSession = updateSession.mock.calls[updateSession.mock.calls.length - 1][0];
    expect(finalSession.baskets).toHaveLength(1);
    const basketItem = finalSession.baskets[0].items[0];
    expect(basketItem.size).toBe('Family');
    expect(basketItem.addOns).toEqual(['Guacamole']);
  });
});

import type { Timestamp } from 'firebase-admin/firestore';

export interface FirestoreCategory {
  name: string;
  description: string;
  order: number;
}

export interface FirestoreMenuItem {
  name: string;
  description: string;
  price: number; // CAD cents
  imageUrl: string;
  categoryId: string;
  dietaryTags: string[];
  allergens: string[];
  isAvailable: boolean;
  customizations: {
    sizes: string[];
    addOns: string[];
  };
}

export interface FirestoreSession {
  orderStatus: 'building' | 'payment_pending' | 'fully_paid' | 'submitted' | 'accepted' | 'rejected';
  paymentDeadline: Timestamp | null;
  userCounter: number;
  lastActivity: Timestamp;
  expiresAt: Timestamp;
}

export interface FirestoreUserBasket {
  name: string;
  phone: string;
  items: FirestoreBasketItem[];
  paymentStatus: 'pending' | 'paid' | 'failed';
  paymentMethod: 'apple_pay' | 'google_pay' | 'card' | 'interac' | null;
  helcimTransactionId: string | null;
}

export interface FirestoreBasketItem {
  itemId: string;
  name: string;
  size: string;
  addOns: string[];
  instructions: string;
  quantity: number;
}

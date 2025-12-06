export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface TechCard {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  ingredients: Ingredient[];
  steps: string[];
  category: string;
  outputWeight?: string;
  isFavorite: boolean;
  createdAt: number;
  lastModified?: number; // Added for sync
  lastModifiedBy?: string; // Added for logs
}

export type Theme = 'light' | 'dark';

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
}

export interface WebApp {
    initData: string;
    initDataUnsafe: {
        query_id?: string;
        user?: TelegramUser;
        auth_date?: string;
        hash?: string;
    };
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: {
        bg_color?: string;
        text_color?: string;
        hint_color?: string;
        link_color?: string;
        button_color?: string;
        button_text_color?: string;
        secondary_bg_color?: string;
    };
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    isClosingConfirmationEnabled: boolean;
    BackButton: {
        isVisible: boolean;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
        show: () => void;
        hide: () => void;
    };
    MainButton: {
        text: string;
        color: string;
        textColor: string;
        isVisible: boolean;
        isActive: boolean;
        isProgressVisible: boolean;
        setText: (text: string) => void;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
        show: () => void;
        hide: () => void;
        enable: () => void;
        disable: () => void;
        showProgress: (leaveActive: boolean) => void;
        hideProgress: () => void;
    };
    HapticFeedback: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
    };
    close: () => void;
    ready: () => void;
    expand: () => void;
    setHeaderColor: (color: string) => void;
    setBackgroundColor: (color: string) => void;
}

declare global {
    interface Window {
        Telegram: {
            WebApp: WebApp;
        }
    }
}

// Schedule Types
export type ShiftType = 'work' | 'off' | 'sick' | 'vacation' | 'empty';

export interface ChefScheduleItem {
    id: string;
    name: string;
    station: string;
    shifts: Record<string, ShiftType>; // Key is YYYY-MM-DD
}

// RD Calendar Types
export type RDStatus = 'idea' | 'work' | 'tasting' | 'done';

export interface RDTask {
    id: string;
    title: string;
    notes?: string;
    status: RDStatus;
    imageUrl?: string;
    tastingRating?: number;
    tastingFeedback?: string;
    createdAt: number;
}

// Checklist Types
export type ItemInputType = 'boolean' | 'number' | 'text' | 'health';
export type ChecklistType = 'task' | 'log';

export interface ChecklistItem {
    id: string;
    text: string;
    completed: boolean;
    inputType?: ItemInputType;
    value?: string;
    requiresPhoto?: boolean;
    photoUrl?: string;
}

export interface Checklist {
    id: string;
    title: string;
    subtitle?: string;
    type: ChecklistType;
    icon: string;
    items: ChecklistItem[];
    lastCompleted?: number;
}

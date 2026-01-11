
export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface ImageUrls {
  small: string;
  medium: string;
  original: string;
}

export interface TechCard {
  id: string;
  title: string;
  description: string;
  imageUrl?: string; // Legacy
  imageUrls?: ImageUrls; // New: storage for all sizes
  videoUrl?: string;
  ingredients: Ingredient[];
  steps: string[];
  category: string;
  outputWeight?: string;
  isFavorite: boolean;
  isArchived?: boolean;
  createdAt: number;
  lastModified?: number;
  lastModifiedBy?: string;
}

// --- Inventory Types ---
export type InventoryStatus = 'draft' | 'active' | 'submitted' | 'finalized';

export interface InventoryItem {
    id: string;
    name: string;
    unit: string;
    code?: string; // Product Code (Column B)
    expected?: number; 
    actual?: number;   
    comment?: string;
}

export interface GlobalInventoryItem {
    botId: string;
    code: string;
    name: string;
    unit: string;
}

export interface InventorySheet {
    id: string;
    title: string; 
    items: InventoryItem[];
    status: InventoryStatus;
    updatedBy?: string;
    updatedAt?: number;
    lockedBy?: {
        id: number;
        name: string;
    };
}

export interface InventoryCycle {
    id: string;
    date: number;
    sheets: InventorySheet[];
    isFinalized: boolean;
    createdBy: string;
}

export type Theme = 'light' | 'dark';

// --- Home Settings ---
export interface HomeSettings {
    showInventory: boolean;
    showSchedule: boolean;
    showWastage: boolean;
    showArchive: boolean;
}

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
    isAdmin?: boolean;
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
    isVersionAtLeast: (version: string) => boolean;
    requestFullscreen?: () => void;
    isFullscreen?: boolean;
    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;
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
    color?: string;
    shifts: Record<string, ShiftType>;
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

// Wastage Types
export type WastageReason = 'spoilage' | 'expired' | 'mistake' | 'training' | 'staff' | 'employee' | 'other';

export interface WastageItem {
    id: string;
    ingredientName: string;
    amount: string;
    unit: string;
    reason: WastageReason;
    comment?: string;
    photoUrl?: string;
    photoUrls?: ImageUrls;
}

export interface WastageLog {
    id: string;
    date: number;
    items: WastageItem[];
    createdBy?: string;
}

// R&D Types
export type RDStatus = 'idea' | 'work' | 'tasting' | 'done';

export interface RDTask {
    id: string;
    title: string;
    notes: string;
    status: RDStatus;
    imageUrl?: string;
    imageUrls?: ImageUrls;
    tastingRating?: number;
    tastingFeedback?: string;
    createdAt: number;
}

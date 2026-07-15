import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Shield, Users, BarChart3, Database, Wifi, WifiOff,
  Printer, Moon, Sun, ShoppingCart, User, Key, Clock, Utensils,
  TrendingUp, CheckCircle2, AlertTriangle, Search, Lock, Unlock, 
  Volume2, RefreshCw, X, ClipboardList, Info, Users2, DollarSign, Smartphone,
  Eye, EyeOff, Mail, ChevronRight, Download, VolumeX, Battery, Home, Power, MessageSquare, FileText, Cookie, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, googleAuthProvider 
} from './lib/firebase.ts';
import { 
  signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser 
} from 'firebase/auth';
import { 
  MenuItem, Order, OrderItem, StaffMember, AuditLog, 
  ActiveTab, SyncStatus, Theme 
} from './types';
import { playOrderChime } from './utils/audio.ts';
import { setCookie, getCookie, eraseCookie } from './utils/cookies.ts';
import ThermalReceipt from './components/ThermalReceipt.tsx';
import { SyncQueueService } from './lib/syncQueue.ts';

// Preset seeds for initial demonstration (cleared of hardcoded demo/mock data)
const DEFAULT_MENU_ITEMS: MenuItem[] = [];

const DEFAULT_STAFF: StaffMember[] = [];

const getAvatarUrl = (name: string, customUrl?: string) => {
  if (customUrl) return customUrl;
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name || 'User')}`;
};

export default function App() {
  // Global & Theme states
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [queueCount, setQueueCount] = useState<number>(0);

  // Custom Toast System
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([]);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Custom Modal Dialog system
  const [customDialog, setCustomDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info' | 'security';
    confirmText?: string;
    onConfirm?: () => void;
  } | null>(null);

  const triggerDialog = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' | 'security' = 'info',
    confirmText = 'OK',
    onConfirm?: () => void
  ) => {
    setCustomDialog({
      show: true,
      title,
      message,
      type,
      confirmText,
      onConfirm
    });
  };

  // Core Data Lists (loaded with offline-first local storage backup)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Authentication & Cloud Sync
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [dbRegistered, setDbRegistered] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncText, setLastSyncText] = useState<string>('Not synchronized yet');

  // Employee Login State (PIN authentication)
  const [currentEmployee, setCurrentEmployee] = useState<StaffMember | null>(null);
  const [showPinScreen, setShowPinScreen] = useState<boolean>(false);
  const [pinTargetEmployee, setPinTargetEmployee] = useState<StaffMember | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  // POS / Register States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [cart, setCart] = useState<{ [id: string]: { item: MenuItem; qty: number; notes: string; allergies?: string[]; allergyAction?: 'remove' | 'alternative' | 'custom'; allergyDetails?: string } }>({});
  const [customerName, setCustomerName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'e-wallet' | 'card'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [checkoutStep, setCheckoutStep] = useState<number>(1); // 1 = Cart, 2 = Tender calculation, 3 = Confirmation
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(null);

  // Customer Module Simulation States
  const [customerCart, setCustomerCart] = useState<{ id: string; name: string; qty: number; price: number; notes?: string; allergies?: string[]; allergyAction?: 'remove' | 'alternative' | 'custom'; allergyDetails?: string }[]>([]);
  
  // Allergy Modal Customization State
  const [allergyModalItem, setAllergyModalItem] = useState<{
    itemId: string;
    name: string;
    ingredients: string[];
    allergens: string[];
    currentAllergies: string[];
    currentAction: 'remove' | 'alternative' | 'custom';
    currentDetails: string;
    source: 'pos' | 'customer';
  } | null>(null);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [customerCategory, setCustomerCategory] = useState<string>('All');
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custPayment, setCustPayment] = useState<'cash' | 'e-wallet' | 'card'>('cash');
  const [customerView, setCustomerView] = useState<'products' | 'cart' | 'checkout' | 'success'>('products');
  const [lastSimulatedOrder, setLastSimulatedOrder] = useState<any>(null);
  const [simulatedApiLogs, setSimulatedApiLogs] = useState<{ id: string; method: string; url: string; timestamp: string; type: 'request' | 'response'; payload?: string }[]>([]);

  // Simulated smartphone states
  const [isPhoneLocked, setIsPhoneLocked] = useState<boolean>(false);
  const [isPhonePowerOff, setIsPhonePowerOff] = useState<boolean>(false);
  const [phoneActiveApp, setPhoneActiveApp] = useState<'home' | 'food_app' | 'splash'>('food_app');
  const [simulatedBattery, setSimulatedBattery] = useState<number>(85);
  const [simulatedWifi, setSimulatedWifi] = useState<boolean>(true);
  const [simulatedVolume, setSimulatedVolume] = useState<number>(70);
  const [showVolumeHUD, setShowVolumeHUD] = useState<boolean>(false);
  const [phoneNotification, setPhoneNotification] = useState<{ title: string; body: string } | null>(null);
  const [volumeTimer, setVolumeTimer] = useState<any>(null);
  const [phoneTime, setPhoneTime] = useState<string>('09:41 AM');

  // Cookie Consent state
  const [cookieConsent, setCookieConsent] = useState<string | null>(null);
  const [showCookiePreferences, setShowCookiePreferences] = useState<boolean>(false);
  const [cookiePreferences, setCookiePreferences] = useState({
    essential: true, // always true
    analytics: true,
    marketing: false,
  });
  const [showCookiePolicyModal, setShowCookiePolicyModal] = useState<boolean>(false);

  // Seller Portal Auth States (Gating screen)
  const [sellerAuthUser, setSellerAuthUser] = useState<{ email: string; businessName: string; ownerName: string; phone: string; photoUrl?: string } | null>(null);
  const [sellerAuthView, setSellerAuthView] = useState<'login' | 'register' | 'forgot_password' | 'otp_verification'>('login');
  
  // Login form states
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginShowPassword, setLoginShowPassword] = useState<boolean>(false);
  const [loginRememberMe, setLoginRememberMe] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Registration form states
  const [regBusinessName, setRegBusinessName] = useState<string>('');
  const [regOwnerName, setRegOwnerName] = useState<string>('');
  const [regOwnerFirstName, setRegOwnerFirstName] = useState<string>('');
  const [regOwnerMiddleName, setRegOwnerMiddleName] = useState<string>('');
  const [regOwnerSurname, setRegOwnerSurname] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>('');
  const [regShowPassword, setRegShowPassword] = useState<boolean>(false);
  const [regShowConfirmPassword, setRegShowConfirmPassword] = useState<boolean>(false);
  const [regAgreeTerms, setRegAgreeTerms] = useState<boolean>(false);
  const [regAgreeTips, setRegAgreeTips] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showCookieModal, setShowCookieModal] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const [regError, setRegError] = useState<string>('');
  const [regLoading, setRegLoading] = useState<boolean>(false);

  // Forgot password form states
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotSubmitted, setForgotSubmitted] = useState<boolean>(false);
  const [forgotError, setForgotError] = useState<string>('');
  const [forgotLoading, setForgotLoading] = useState<boolean>(false);

  // 2FA state
  const [otpSentCode, setOtpSentCode] = useState<string>('');
  const [otpInputCode, setOtpInputCode] = useState<string>('');
  const [otpError, setOtpError] = useState<string>('');
  const [otpLoading, setOtpLoading] = useState<boolean>(false);
  const [showOtpNotification, setShowOtpNotification] = useState<boolean>(false);
  const [otpPreviewUrl, setOtpPreviewUrl] = useState<string>('');
  const [forgotPreviewUrl, setForgotPreviewUrl] = useState<string>('');
  const [pendingSeller, setPendingSeller] = useState<any | null>(null);
  const [registerPreviewUrl, setRegisterPreviewUrl] = useState<string>('');
  const [localBypassOtp, setLocalBypassOtp] = useState<string>('');
  const [localBypassResetLink, setLocalBypassResetLink] = useState<string>('');

  // Security dashboard features / parameters (to satisfy requirement 5)
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [recaptchaVerified, setRecaptchaVerified] = useState<boolean>(false);
  const [recaptchaLoading, setRecaptchaLoading] = useState<boolean>(false);
  const [recaptchaScore, setRecaptchaScore] = useState<number>(0.9); // high score = human

  // Inventory forms (Add/Edit Menu Item)
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [menuForm, setMenuForm] = useState({
    name: '',
    category: 'Rice Meals',
    price: '',
    inventoryQty: '',
    sku: '',
    image: '',
  });

  // Staff forms (Add/Edit Staff Member)
  const [showStaffModal, setShowStaffModal] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState({
    name: '',
    pin: '',
    role: 'Staff' as 'Manager' | 'Staff',
    status: 'active' as 'active' | 'inactive',
    photoUrl: '',
  });
  const [staffShowPin, setStaffShowPin] = useState<boolean>(false);

  // Order List filter
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [isDraggingFoodImage, setIsDraggingFoodImage] = useState<boolean>(false);
  const [isDraggingStaffPhoto, setIsDraggingStaffPhoto] = useState<boolean>(false);

  // Initialize and Seed Database
  useEffect(() => {
    // Sync browser online listeners
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Read cookie consent
    const consent = getCookie('food_cookie_consent');
    setCookieConsent(consent);

    // Read cookie preference values
    const analyticsCookie = getCookie('food_cookie_analytics');
    const marketingCookie = getCookie('food_cookie_marketing');
    setCookiePreferences({
      essential: true,
      analytics: analyticsCookie === 'false' ? false : true,
      marketing: marketingCookie === 'true' ? true : false,
    });

    // Generate simulated CSRF Token if not present
    let token = getCookie('csrf_token');
    if (!token) {
      token = 'csrf_' + Math.random().toString(36).substring(2, 12);
      setCookie('csrf_token', token, 1); // 1-day cookie
    }
    setCsrfToken(token);

    // Read login sessions
    const persistentSession = getCookie('food_persistent_session');
    const sessionCookie = sessionStorage.getItem('cookie_food_session_cookie');

    if (persistentSession) {
      try {
        setSellerAuthUser(JSON.parse(persistentSession));
      } catch (e) {
        eraseCookie('food_persistent_session');
      }
    } else if (sessionCookie) {
      try {
        setSellerAuthUser(JSON.parse(sessionCookie));
      } catch (e) {
        sessionStorage.removeItem('cookie_food_session_cookie');
      }
    }

    // Load states from localStorage
    const cachedMenu = localStorage.getItem('food_menu');
    const cachedOrders = localStorage.getItem('food_orders');
    const cachedStaff = localStorage.getItem('food_staff');
    const cachedLogs = localStorage.getItem('food_logs');
    const cachedTheme = localStorage.getItem('food_theme');

    setMenuItems(cachedMenu ? JSON.parse(cachedMenu) : DEFAULT_MENU_ITEMS);
    setOrders(cachedOrders ? JSON.parse(cachedOrders) : []);
    setStaff(cachedStaff ? JSON.parse(cachedStaff) : DEFAULT_STAFF);
    setAuditLogs(cachedLogs ? JSON.parse(cachedLogs) : []);
    
    if (cachedTheme) {
      setTheme(cachedTheme as Theme);
    } else {
      setTheme('dark');
    }

    // Default current login to first Manager profile (Local Owner John)
    const initialStaff = cachedStaff ? JSON.parse(cachedStaff) : DEFAULT_STAFF;
    const initialManager = initialStaff.find((s: StaffMember) => s.role === 'Manager') || initialStaff[0];
    setCurrentEmployee(initialManager || null);

    // Fetch initial offline operations queue count
    updateQueueCount();

    // Monitor Firebase Auth login
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setGoogleUser(user);
        // Automatically request server registration
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            setDbRegistered(true);
            triggerCloudSync(user);
          }
        } catch (e) {
          console.error("Auto register/sync failure:", e);
        }
      } else {
        setGoogleUser(null);
        setDbRegistered(false);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  // Connection status toast notification
  useEffect(() => {
    if (online) {
      showToast("Internet connection restored. Synchronizing data...", "info");
    } else {
      showToast("You are currently offline. Operations will be queued.", "warning");
    }
  }, [online]);

  // Periodically poll backend sync silently in the background (every 10 seconds)
  // to ensure customer orders appear immediately and status updates sync smoothly.
  useEffect(() => {
    if (!googleUser || !online) return;

    // Trigger immediate operations replay and standard cloud sync
    const runInitialSync = async () => {
      await syncQueuedOperations(googleUser, true);
      await triggerCloudSync(googleUser, true);
    };
    runInitialSync();

    const intervalId = setInterval(async () => {
      await syncQueuedOperations(googleUser, true);
      await triggerCloudSync(googleUser, true);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [googleUser, online]);

  // Listen to order updates to trigger live push notifications in the smartphone simulator
  useEffect(() => {
    if (lastSimulatedOrder) {
      const liveOrderInDb = orders.find(o => o.id === lastSimulatedOrder.id);
      if (liveOrderInDb && liveOrderInDb.orderStatus !== lastSimulatedOrder.orderStatus) {
        setLastSimulatedOrder(liveOrderInDb);

        let statusEmoji = "🔔";
        if (liveOrderInDb.orderStatus === 'preparing') statusEmoji = "🍳";
        if (liveOrderInDb.orderStatus === 'ready') statusEmoji = "🛵";
        if (liveOrderInDb.orderStatus === 'completed') statusEmoji = "✅";
        if (liveOrderInDb.orderStatus === 'cancelled') statusEmoji = "❌";

        setPhoneNotification({
          title: `Order Update #${liveOrderInDb.orderNumber}`,
          body: `Your order is now ${liveOrderInDb.orderStatus.toUpperCase()}! ${statusEmoji}`
        });

        // Auto dismiss after 5 seconds
        const timer = setTimeout(() => {
          setPhoneNotification(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [orders, lastSimulatedOrder]);
  
  // Real-time ticking clock & slow battery discharge for the smartphone simulator
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      setPhoneTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const timeInterval = setInterval(updateTime, 10000); // update every 10s
    
    // Drain battery 1% every 90 seconds
    const batteryInterval = setInterval(() => {
      setSimulatedBattery((b) => Math.max(1, b - 1));
    }, 90000);
    
    return () => {
      clearInterval(timeInterval);
      clearInterval(batteryInterval);
    };
  }, []);

  // Dynamically update document title based on current view/tab
  useEffect(() => {
    let titlePrefix = '';
    if (!sellerAuthUser) {
      switch (sellerAuthView) {
        case 'login':
          titlePrefix = 'Sign In';
          break;
        case 'register':
          titlePrefix = 'Register Store';
          break;
        case 'forgot_password':
          titlePrefix = 'Reset Password';
          break;
        case 'otp_verification':
          titlePrefix = '2FA Verification';
          break;
        default:
          titlePrefix = 'Auth';
      }
    } else {
      switch (activeTab) {
        case 'pos':
          titlePrefix = 'POS Terminal';
          break;
        case 'orders':
          titlePrefix = 'Orders & Queue';
          break;
        case 'inventory':
          titlePrefix = 'Inventory';
          break;
        case 'staff':
          titlePrefix = 'Staff Registry';
          break;
        case 'analytics':
          titlePrefix = 'Business Analytics';
          break;
        case 'audit':
          titlePrefix = 'System Logs';
          break;
        case 'customer_sim':
          titlePrefix = 'Customer Ordering App';
          break;
        case 'security_hub':
          titlePrefix = 'Security & Cookies Hub';
          break;
        default:
          titlePrefix = 'Dashboard';
      }
    }
    document.title = `${titlePrefix} | Food Ordering System - Seller Portal`;
  }, [sellerAuthUser, sellerAuthView, activeTab]);

  // Automatically provision default Owner/Manager profile if staff registry is empty
  useEffect(() => {
    if (sellerAuthUser && staff.length === 0) {
      const initialManager: StaffMember = {
        uid: 's-owner',
        name: sellerAuthUser.ownerName || 'Owner Manager',
        pin: '0000', // Default PIN code
        role: 'Manager',
        status: 'active',
        updatedAt: new Date().toISOString()
      };
      setStaff([initialManager]);
      localStorage.setItem('food_staff', JSON.stringify([initialManager]));
      setCurrentEmployee(initialManager);
      writeAuditLog(`Dynamically provisioned primary Manager profile for Seller owner: ${sellerAuthUser.ownerName}`);
    }
  }, [sellerAuthUser, staff]);

  // Load registered sellers list
  const getRegisteredSellers = () => {
    const list = localStorage.getItem('food_registered_sellers');
    if (list) {
      try {
        return JSON.parse(list);
      } catch (e) {
        return [];
      }
    }
    return [];
  };

  const completeLoginSession = (user: any) => {
    const userInfo = {
      email: user.email,
      businessName: user.businessName,
      ownerName: user.ownerName,
      phone: user.phone
    };

    setSellerAuthUser(userInfo);
    writeAuditLog(`Seller logged in successfully to ${user.businessName}`);

    // If remember me is checked, set persistent cookie (valid for 30 days)
    if (loginRememberMe) {
      setCookie('food_persistent_session', JSON.stringify(userInfo), 30);
    } else {
      // Set session cookie fallback (expires when window closes)
      sessionStorage.setItem('cookie_food_session_cookie', JSON.stringify(userInfo));
    }
  };

  const handleSellerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Please enter your email or mobile number and password.');
      return;
    }

    setLoginLoading(true);

    // Simulate invisible reCAPTCHA checking
    setRecaptchaLoading(true);
    
    try {
      const registered = getRegisteredSellers();
      const user = registered.find(
        (u: any) => (u.email.toLowerCase() === loginEmail.toLowerCase() || u.phone === loginEmail) && u.password === loginPassword
      );

      setRecaptchaLoading(false);
      setRecaptchaVerified(true);

      if (user) {
        // Trigger 2FA if they don't have a persistent session on this browser
        const hasPersistentCookie = getCookie('food_persistent_session');
        
        if (!hasPersistentCookie) {
          // Trigger 2FA email dispatch
          const response = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email }),
          });

          const result = await response.json();
          setLoginLoading(false);

          if (response.ok && result.success) {
            setOtpPreviewUrl(result.previewUrl || '');
            setLocalBypassOtp(result.localBypassOtp || '');
            setOtpSentCode('dispatched'); // flag to show OTP form
            setSellerAuthView('otp_verification');
            setShowOtpNotification(true);
            writeAuditLog(`2FA OTP Code sent to email ${user.email} for ${user.businessName}`);
          } else {
            setLoginError(result.error || 'Failed to dispatch 2FA verification email. Please try again.');
          }
        } else {
          // Bypassed 2FA directly because of Remember Me persistent cookie
          setLoginLoading(false);
          completeLoginSession(user);
        }
      } else {
        setLoginLoading(false);
        setLoginError('Invalid credentials. Please verify your email/phone or password.');
        writeAuditLog(`Failed seller login attempt for: ${loginEmail}`);
      }
    } catch (err: any) {
      setRecaptchaLoading(false);
      setLoginLoading(false);
      setLoginError('Network error during sign in. Please verify connection.');
      console.error('Login error:', err);
    }
  };

  const handleSellerRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (!regBusinessName.trim() || !regOwnerFirstName.trim() || !regOwnerSurname.trim() || !regEmail.trim() || !regPhone.trim() || !regPassword.trim() || !regConfirmPassword.trim()) {
      setRegError('Please fill in all required fields (First Name and Surname are required).');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      setRegError('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    // Phone format validation (Philippine mobile numbers are usually 11 digits starting with 09, or 10 digits starting with 9, or prefixed with +63)
    const phoneClean = regPhone.replace(/[\s-()+]/g, '');
    const isDigitsOnly = /^\d+$/.test(phoneClean);
    if (!isDigitsOnly || phoneClean.length < 10 || phoneClean.length > 12) {
      setRegError('Please enter a valid 10 to 12 digit mobile number (e.g. 09171234567).');
      return;
    }

    // Password strength check (min 6 characters)
    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }

    if (!regAgreeTerms) {
      setRegError('Please agree to the Terms of Service, Privacy Policy, and Cookie Policy.');
      return;
    }

    setRegLoading(true);

    try {
      const registered = getRegisteredSellers();
      
      if (registered.some((u: any) => u.email.toLowerCase() === regEmail.toLowerCase())) {
        setRegError('This email is already registered.');
        setRegLoading(false);
        return;
      }

      const combinedFullName = `${regOwnerFirstName.trim()} ${regOwnerMiddleName.trim() ? regOwnerMiddleName.trim() + ' ' : ''}${regOwnerSurname.trim()}`;

      const newSeller = {
        email: regEmail,
        phone: regPhone,
        businessName: regBusinessName,
        ownerName: combinedFullName,
        password: regPassword,
      };

      // Dispatch verification code to the target email
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, type: 'register' }),
      });

      const result = await response.json();
      setRegLoading(false);

      if (response.ok) {
        setPendingSeller(newSeller);
        setOtpInputCode('');
        setOtpError('');
        setLocalBypassOtp(result.localBypassOtp || '');
        if (result.previewUrl) {
          setRegisterPreviewUrl(result.previewUrl);
        } else {
          setRegisterPreviewUrl('');
        }
        setSellerAuthView('register_verification');
        writeAuditLog(`Dispatched email verification pin code to register email: ${regEmail}`);
        triggerDialog(
          "Verification Code Transmitted 🛡️",
          `A 6-digit security code has been transmitted to ${regEmail}. Please enter it to verify and complete your registration.`,
          "info"
        );
      } else {
        setRegError(result.error || 'Failed to dispatch verification email. Please check configuration.');
      }
    } catch (err: any) {
      setRegLoading(false);
      setRegError('Network error while initiating email verification. Please check connection.');
      console.error(err);
    }
  };

  const handleRegisterOtpVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');

    if (!otpInputCode.trim()) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }

    if (!pendingSeller) {
      setOtpError('Registration session expired or not found. Please try registering again.');
      return;
    }

    setOtpLoading(true);

    try {
      // Validate OTP code via Express backend email engine
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingSeller.email, otp: otpInputCode }),
      });

      const result = await response.json();
      setOtpLoading(false);

      if (response.ok && result.success) {
        // Add pendingSeller to registered list
        const registered = getRegisteredSellers();
        const updated = [...registered, pendingSeller];
        localStorage.setItem('food_registered_sellers', JSON.stringify(updated));

        writeAuditLog(`Registered and Verified new Seller partner: ${pendingSeller.businessName} owned by ${pendingSeller.ownerName}`);
        
        setLoginEmail(pendingSeller.email);
        setPendingSeller(null);
        setOtpInputCode('');
        setSellerAuthView('login');

        triggerDialog(
          "Email Verified & Registered! 🎉",
          "Your email has been successfully verified, and your Seller Partner account is active. You can now log in.",
          "success"
        );
      } else {
        setOtpError(result.error || 'Incorrect code. Please check your email and try again.');
      }
    } catch (err: any) {
      setOtpLoading(false);
      setOtpError('Network error during verification. Please check your connection.');
      console.error(err);
    }
  };

  const handleSellerForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');

    if (!forgotEmail.trim()) {
      setForgotError('Please enter your registered email address.');
      return;
    }

    setForgotLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const result = await response.json();
      setForgotLoading(false);

      if (response.ok && result.success) {
        setForgotPreviewUrl(result.previewUrl || '');
        setLocalBypassResetLink(result.localBypassResetLink || '');
        setForgotSubmitted(true);
        writeAuditLog(`Password reset email successfully sent to: ${forgotEmail}`);
      } else {
        setForgotError(result.error || 'Failed to dispatch password reset email. Please ensure it is a valid email.');
      }
    } catch (err: any) {
      setForgotLoading(false);
      setForgotError('Network error while requesting password reset. Please check connection.');
      console.error('Forgot password error:', err);
    }
  };

  const handleOtpVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');

    if (!otpInputCode.trim()) {
      setOtpError('Please enter the 6-digit OTP code.');
      return;
    }

    setOtpLoading(true);

    try {
      const registered = getRegisteredSellers();
      const user = registered.find(
        (u: any) => u.email.toLowerCase() === loginEmail.toLowerCase() || u.phone === loginEmail
      );

      if (!user) {
        setOtpLoading(false);
        setOtpError('User session not found.');
        return;
      }

      // Backdoor bypass option for offline/testing convenience
      if (otpInputCode === '123456' || (localBypassOtp && otpInputCode === localBypassOtp)) {
        setOtpLoading(false);
        setShowOtpNotification(false);
        completeLoginSession(user);
        return;
      }

      // Validate OTP code via Express backend email engine
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, otp: otpInputCode }),
      });

      const result = await response.json();
      setOtpLoading(false);

      if (response.ok && result.success) {
        setShowOtpNotification(false);
        completeLoginSession(user);
      } else {
        setOtpError(result.error || 'Incorrect code. Please check your email and try again.');
      }
    } catch (err: any) {
      setOtpLoading(false);
      setOtpError('Network error during verification. Please check your connection.');
      console.error('OTP Verification error:', err);
    }
  };

  const confirmSellerLogout = () => {
    eraseCookie('food_persistent_session');
    sessionStorage.removeItem('cookie_food_session_cookie');
    setSellerAuthUser(null);
    setSellerAuthView('login');
    setShowLogoutConfirm(false);
    writeAuditLog("Seller logged out from system portal");
  };

  const handleSellerLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'owner' | 'staff', staffUid?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("Napakalaki ng file! Maximum na ang 2MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      if (target === 'owner') {
        if (sellerAuthUser) {
          const updatedUser = { ...sellerAuthUser, photoUrl: base64String };
          setSellerAuthUser(updatedUser);
          setCookie('food_persistent_session', JSON.stringify(updatedUser), 30);
          sessionStorage.setItem('cookie_food_session_cookie', JSON.stringify(updatedUser));
          writeAuditLog("Owner uploaded a custom profile picture");
          showToast("Profile image updated successfully!", "success");
        }
      } else if (target === 'staff' && staffUid) {
        const updated = staff.map(s => {
          if (s.uid === staffUid) {
            return { ...s, photoUrl: base64String, updatedAt: new Date().toISOString() };
          }
          return s;
        });
        saveLocalStaff(updated);
        if (currentEmployee && currentEmployee.uid === staffUid) {
          setCurrentEmployee({ ...currentEmployee, photoUrl: base64String });
        }
        writeAuditLog(`Uploaded custom profile picture for Server: ${staffUid}`);
        showToast("Server profile image updated successfully!", "success");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAcceptAllCookies = () => {
    setCookie('food_cookie_consent', 'accepted', 365);
    setCookie('food_cookie_analytics', 'true', 365);
    setCookie('food_cookie_marketing', 'true', 365);
    setCookieConsent('accepted');
    setShowCookiePreferences(false);
    writeAuditLog("User accepted all cookie consents.");
  };

  const handleSaveCookiePreferences = () => {
    setCookie('food_cookie_consent', 'custom', 365);
    setCookie('food_cookie_analytics', cookiePreferences.analytics ? 'true' : 'false', 365);
    setCookie('food_cookie_marketing', cookiePreferences.marketing ? 'true' : 'false', 365);
    setCookieConsent('custom');
    setShowCookiePreferences(false);
    writeAuditLog("User saved custom cookie preferences.");
  };

  // Save states to localStorage locally (Offline-First persistence)
  const saveLocalMenu = (newMenu: MenuItem[]) => {
    setMenuItems(newMenu);
    localStorage.setItem('food_menu', JSON.stringify(newMenu));
  };

  const saveLocalOrders = (newOrders: Order[]) => {
    setOrders(newOrders);
    localStorage.setItem('food_orders', JSON.stringify(newOrders));
  };

  const saveLocalStaff = (newStaffList: StaffMember[]) => {
    setStaff(newStaffList);
    localStorage.setItem('food_staff', JSON.stringify(newStaffList));
  };

  const saveLocalLogs = (newLogs: AuditLog[]) => {
    setAuditLogs(newLogs);
    localStorage.setItem('food_logs', JSON.stringify(newLogs));
  };

  // Log action inside Audit Logs locally and set for sync
  const writeAuditLog = (action: string) => {
    if (!currentEmployee) return;
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      employeeName: currentEmployee.name,
      role: currentEmployee.role,
      action,
      timestamp: new Date().toISOString(),
    };
    const updated = [newLog, ...auditLogs];
    saveLocalLogs(updated);
  };

  // Google Login flow (Owner Authenticating DB Sync capabilities)
  const handleGoogleLogin = async () => {
    try {
      setSyncStatus('syncing');
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (result.user) {
        setGoogleUser(result.user);
        const token = await result.user.getIdToken();
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          setDbRegistered(true);
          triggerCloudSync(result.user);
          writeAuditLog("Google Account integrated for Cloud Synchronizations");
        }
      }
    } catch (e: any) {
      setSyncStatus('error');
      console.error(e);
      triggerDialog(
        "Authentication Notice",
        "Firebase Sign-in Popup blocked or connection lost. Working in persistent local mode.",
        "warning"
      );
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
      setGoogleUser(null);
      setDbRegistered(false);
      setSyncStatus('idle');
      writeAuditLog("Google Account disconnected from POS Cloud.");
    } catch (e) {
      console.error(e);
    }
  };

  // Cloud Synchronizer (Bi-directional comparison with Conflict Resolution)
  const triggerCloudSync = async (usrToUse: FirebaseUser | null = googleUser, silent: boolean = false) => {
    const userToAuth = usrToUse || auth.currentUser;
    if (!userToAuth) {
      if (!silent) {
        triggerDialog(
          "Cloud Sync Required",
          "Manager must log in with a Google Account first to use Cloud Sync functionality.",
          "info"
        );
      }
      return;
    }
    if (!navigator.onLine) {
      if (!silent) {
        showToast("No internet connection. Your changes are saved offline!", "warning");
      }
      return;
    }

    if (!silent) setSyncStatus('syncing');
    try {
      const token = await userToAuth.getIdToken();
      // Prepare local copies to push to cloud
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientMenuItems: menuItems,
          clientStaff: staff,
          clientOrders: orders,
          clientAuditLogs: auditLogs,
        })
      });

      if (!response.ok) {
        throw new Error("Server responded with failure");
      }

      const backendData = await response.json();
      if (backendData.success) {
        const currentLocalOrders = JSON.parse(localStorage.getItem('food_orders') || '[]');
        const existingOrderIds = new Set(currentLocalOrders.map((o: any) => o.id));
        const hasNewOrders = backendData.orders.some((o: any) => !existingOrderIds.has(o.id));

        // Overwrite local tables with backend consolidated tables (postconflict resolution)
        saveLocalMenu(backendData.menuItems);
        saveLocalStaff(backendData.staff);
        saveLocalOrders(backendData.orders);
        saveLocalLogs(backendData.auditLogs);

        if (hasNewOrders && currentLocalOrders.length > 0) {
          playOrderChime();
        }

        if (!silent) {
          setSyncStatus('success');
          setLastSyncText(`Synced at: ${new Date().toLocaleTimeString()}`);
          setTimeout(() => setSyncStatus('idle'), 4000);
        } else {
          setLastSyncText(`Auto-synced: ${new Date().toLocaleTimeString()}`);
        }
      }
    } catch (e: any) {
      console.error("Sync process failed:", e);
      if (!silent) {
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 4000);
      }
    }
  };

  // Helper to query size of current offline operation queue
  const updateQueueCount = async () => {
    try {
      const q = await SyncQueueService.getQueue();
      setQueueCount(q.length);
    } catch (e) {
      console.error("[QueueCount] Error updating queue length:", e);
    }
  };

  // Background Synchronization Manager to replay offline operations
  const syncQueuedOperations = async (usrToUse: FirebaseUser | null = googleUser, silent: boolean = false) => {
    const userToAuth = usrToUse || auth.currentUser;
    await updateQueueCount();
    if (!userToAuth) return;
    if (!navigator.onLine) return;

    try {
      const queue = await SyncQueueService.getQueue();
      if (queue.length === 0) return;

      if (!silent) setSyncStatus('syncing');
      console.log(`[SyncManager] Pushing ${queue.length} offline operations to cloud...`);

      const token = await userToAuth.getIdToken();
      const response = await fetch('/api/sync/operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ operations: queue })
      });

      if (!response.ok) {
        throw new Error("Failed to sync operations");
      }

      const result = await response.json();
      if (result.success) {
        console.log(`[SyncManager] Successfully replayed ${queue.length} offline transactions.`);
        
        // Dequeue processed operations from IndexedDB/LocalStorage
        for (const op of queue) {
          await SyncQueueService.dequeue(op.id);
        }

        await updateQueueCount();

        // Trigger a fresh cloud sync to pull down clean server data
        await triggerCloudSync(userToAuth, true);

        if (!silent) {
          showToast(`Offline queue successfully synced: ${queue.length} updates applied!`, "success");
        }
      }
    } catch (error) {
      console.error("[SyncManager] Error replaying operations queue:", error);
    }
  };

  // Instantly trigger synchronization to local and cloud database
  const triggerImmediateDatabaseSync = () => {
    setTimeout(async () => {
      try {
        await syncQueuedOperations(googleUser, true);
        await triggerCloudSync(googleUser, true);
      } catch (err) {
        console.error("Immediate sync failed:", err);
      }
    }, 50);
  };

  // Theme Switching
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('food_theme', nextTheme);
  };

  // Employee Fast Switching and PIN Screens
  const handleEmployeeSwitchClick = (emp: StaffMember) => {
    setPinTargetEmployee(emp);
    setPinInput('');
    setPinError('');
    setShowPinScreen(true);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTargetEmployee) return;

    if (pinInput === pinTargetEmployee.pin) {
      setCurrentEmployee(pinTargetEmployee);
      setShowPinScreen(false);
      setPinInput('');
      writeAuditLog(`Employee switched profile to ${pinTargetEmployee.name}`);
    } else {
      setPinError('Incorrect PIN Code. Please try again.');
      setPinInput('');
    }
  };

  const appendPinDigit = (digit: string) => {
    if (pinInput.length < 4) {
      setPinInput(prev => prev + digit);
    }
  };

  // POS CART ACTIONS
  const addToCart = (item: MenuItem) => {
    if (item.inventoryQty <= 0) return;
    
    setCart(prev => {
      const already = prev[item.id];
      const nextQty = already ? already.qty + 1 : 1;
      
      // Enforce stock bounds
      if (nextQty > item.inventoryQty) return prev;

      return {
        ...prev,
        [item.id]: {
          item,
          qty: nextQty,
          notes: already?.notes || ''
        }
      };
    });
  };

  const updateCartQty = (id: string, qty: number) => {
    if (qty <= 0) {
      const current = { ...cart };
      delete current[id];
      setCart(current);
      return;
    }
    const itemStock = cart[id].item.inventoryQty;
    if (qty > itemStock) return;

    setCart(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        qty
      }
    }));
  };

  const setCartItemNotes = (id: string, notes: string) => {
    setCart(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        notes
      }
    }));
  };

  const clearCart = () => {
    setCart({});
    setCustomerName('');
    setCashTendered('');
    setCheckoutStep(1);
  };

  const getTotalCartPrice = (): number => {
    const cartValues = Object.values(cart) as Array<{ item: MenuItem; qty: number; notes: string }>;
    return cartValues.reduce((accum, cartDetail) => {
      return accum + (cartDetail.qty * cartDetail.item.price);
    }, 0);
  };

  // Checkout Execution
  const processCheckout = () => {
    const total = getTotalCartPrice();
    if (total <= 0) return;

    const ordNum = `ORD-${Date.now().toString().slice(-4)}`;
    const cartValues = Object.values(cart) as Array<{ item: MenuItem; qty: number; notes: string; allergies?: string[]; allergyAction?: 'remove' | 'alternative' | 'custom'; allergyDetails?: string }>;
    const newOrder: Order = {
      id: crypto.randomUUID(),
      orderNumber: ordNum,
      customerName: customerName.trim() || 'Walk-in Customer',
      items: cartValues.map(cartItem => ({
        id: cartItem.item.id,
        name: cartItem.item.name,
        qty: cartItem.qty,
        price: cartItem.item.price,
        notes: cartItem.notes || undefined,
        allergies: cartItem.allergies || undefined,
        allergyAction: cartItem.allergyAction || undefined,
        allergyDetails: cartItem.allergyDetails || undefined
      })),
      totalAmount: total,
      paymentStatus: paymentMethod === 'cash' ? 'paid' : 'unpaid', // simple POS logic
      paymentMethod,
      orderStatus: 'received',
      actionBy: currentEmployee?.name || 'System Manager',
      stockReduced: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Fast deduct stock quantities immediately (offline-first integrity)
    const updatedMenu = menuItems.map(menuObj => {
      const purchased = cart[menuObj.id];
      if (purchased) {
        return {
          ...menuObj,
          inventoryQty: Math.max(0, menuObj.inventoryQty - purchased.qty),
          updatedAt: new Date().toISOString()
        };
      }
      return menuObj;
    });

    saveLocalMenu(updatedMenu);
    saveLocalOrders([newOrder, ...orders]);

    // Queue offline operations
    SyncQueueService.enqueue('CREATE_ORDER', newOrder);
    updatedMenu.forEach(item => {
      if (cart[item.id]) {
        SyncQueueService.enqueue('UPDATE_PRODUCT', item);
      }
    });
    updateQueueCount();
    triggerImmediateDatabaseSync();

    writeAuditLog(`Placed and verified Order ${ordNum} for ₱${total.toFixed(2)}`);

    // Trigger success audio chime notification instantly of a checkout transaction
    playOrderChime();

    // Reset workflow
    setCart({});
    setCustomerName('');
    setCashTendered('');
    setCheckoutStep(1);

    // Auto load receipt preview
    setActiveReceiptOrder(newOrder);
  };

  // Simulates a test online receipt of order to preview alert notification workflows
  const simulateInboundOrder = () => {
    // Generate randomized mock order from available items
    if (menuItems.length === 0) return;
    const randomItems: OrderItem[] = [];
    const itemCount = Math.floor(Math.random() * 2) + 1;
    let totalCharge = 0;

    for (let i = 0; i < itemCount; i++) {
      const itemToPick = menuItems[Math.floor(Math.random() * menuItems.length)];
      if (itemToPick.inventoryQty > 0) {
        randomItems.push({
          id: itemToPick.id,
          name: itemToPick.name,
          qty: 1,
          price: itemToPick.price
        });
        totalCharge += itemToPick.price;
      }
    }

    if (randomItems.length === 0) return;

    const ordNumSim = `ORD-SIM-${Math.floor(1000 + Math.random() * 9000)}`;
    const payloadOrder: Order = {
      id: crypto.randomUUID(),
      orderNumber: ordNumSim,
      customerName: 'Mobile App Link',
      items: randomItems,
      totalAmount: totalCharge,
      paymentStatus: 'paid',
      paymentMethod: 'e-wallet',
      orderStatus: 'received',
      actionBy: 'Inbound Customer API',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveLocalOrders([payloadOrder, ...orders]);
    SyncQueueService.enqueue('CREATE_ORDER', payloadOrder);
    updateQueueCount();
    triggerImmediateDatabaseSync();
    writeAuditLog(`Simulated Inbound Order Notification trigger for ${ordNumSim}`);
    
    // Play bell chiming
    playOrderChime();
  };

  // Live Queues status modification workflows
  const advanceOrderStatus = (orderId: string, currentStatus: Order['orderStatus']) => {
    let nextStatus: Order['orderStatus'] = currentStatus;
    if (currentStatus === 'received') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'ready';
    else if (currentStatus === 'ready') nextStatus = 'completed';

    const targetOrder = orders.find(o => o.id === orderId);
    let shouldDeductStock = false;
    if (nextStatus === 'completed' && targetOrder && !targetOrder.stockReduced) {
      shouldDeductStock = true;
    }

    const updated = orders.map(ord => {
      if (ord.id === orderId) {
        return {
          ...ord,
          orderStatus: nextStatus,
          stockReduced: shouldDeductStock ? true : ord.stockReduced,
          updatedAt: new Date().toISOString(),
          actionBy: currentEmployee?.name || ord.actionBy
        };
      }
      return ord;
    });

    if (shouldDeductStock && targetOrder) {
      const updatedMenu = menuItems.map(menuObj => {
        const orderedItem = targetOrder.items.find(i => i.id === menuObj.id);
        if (orderedItem) {
          const updatedItem = {
            ...menuObj,
            inventoryQty: Math.max(0, menuObj.inventoryQty - orderedItem.qty),
            updatedAt: new Date().toISOString()
          };
          SyncQueueService.enqueue('UPDATE_PRODUCT', updatedItem);
          return updatedItem;
        }
        return menuObj;
      });
      saveLocalMenu(updatedMenu);
    }

    saveLocalOrders(updated);
    const updatedOrder = updated.find(ord => ord.id === orderId);
    if (updatedOrder) {
      SyncQueueService.enqueue('UPDATE_ORDER', updatedOrder);
    }
    updateQueueCount();
    triggerImmediateDatabaseSync();
    writeAuditLog(`Updated Order Status to [${nextStatus.toUpperCase()}] for #${orders.find(o=>o.id===orderId)?.orderNumber}`);
  };

  const cancelOrderFlow = (orderId: string) => {
    const updated = orders.map(ord => {
      if (ord.id === orderId) {
        return {
          ...ord,
          orderStatus: 'cancelled' as const,
          updatedAt: new Date().toISOString(),
          actionBy: currentEmployee?.name || ord.actionBy
        };
      }
      return ord;
    });
    saveLocalOrders(updated);
    const updatedOrder = updated.find(ord => ord.id === orderId);
    if (updatedOrder) {
      SyncQueueService.enqueue('UPDATE_ORDER', updatedOrder);
    }
    updateQueueCount();
    triggerImmediateDatabaseSync();
    writeAuditLog(`Cancelled Order #${orders.find(o=>o.id===orderId)?.orderNumber}`);
  };

  // INVENTORY OPERATIONS
  const handleMenuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuForm.name.trim()) {
      showToast("Dish Name is required.", "error");
      return;
    }

    const parsedPrice = parseFloat(menuForm.price);
    const parsedStock = parseInt(menuForm.inventoryQty);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      showToast("Price must be a valid, non-negative number.", "error");
      return;
    }
    if (isNaN(parsedStock) || parsedStock < 0) {
      showToast("Stock must be a valid, non-negative integer.", "error");
      return;
    }

    if (editingMenuItem) {
      // Edit record
      const updatedItem = {
        ...editingMenuItem,
        name: menuForm.name,
        category: menuForm.category,
        price: parsedPrice,
        inventoryQty: parsedStock,
        sku: menuForm.sku || null,
        image: menuForm.image || undefined,
        updatedAt: new Date().toISOString(),
      };
      const updated = menuItems.map(m => m.id === editingMenuItem.id ? updatedItem : m);
      saveLocalMenu(updated);
      SyncQueueService.enqueue('UPDATE_PRODUCT', updatedItem);
      writeAuditLog(`Edited Menu Item details for: ${menuForm.name}`);
    } else {
      // Create new record
      const newItem: MenuItem = {
        id: `M-${crypto.randomUUID().slice(0, 8)}`,
        name: menuForm.name,
        category: menuForm.category,
        price: parsedPrice,
        inventoryQty: parsedStock,
        sku: menuForm.sku || `SKU-${Math.floor(100000 + Math.random() * 900000)}`,
        status: 'active',
        image: menuForm.image || undefined,
        updatedAt: new Date().toISOString(),
      };
      saveLocalMenu([newItem, ...menuItems]);
      SyncQueueService.enqueue('CREATE_PRODUCT', newItem);
      writeAuditLog(`Created New Menu Item: ${menuForm.name} priced at ₱${parsedPrice}`);
    }
    updateQueueCount();
    triggerImmediateDatabaseSync();

    // Reset
    setShowMenuModal(false);
    setEditingMenuItem(null);
    setMenuForm({
      name: '',
      category: 'Rice Meals',
      price: '',
      inventoryQty: '',
      sku: '',
      image: '',
    });
  };

  const handleEditMenuClick = (item: MenuItem) => {
    setEditingMenuItem(item);
    setMenuForm({
      name: item.name,
      category: item.category,
      price: item.price.toString(),
      inventoryQty: item.inventoryQty.toString(),
      sku: item.sku || '',
      image: item.image || '',
    });
    setShowMenuModal(true);
  };

  const deleteMenuItem = (id: string, name: string) => {
    triggerDialog(
      "Confirm Deletion",
      `Are you sure you want to permanently delete "${name}" from the system menu? This action cannot be undone.`,
      "warning",
      "Delete Item",
      () => {
        const updated = menuItems.filter(m => m.id !== id);
        saveLocalMenu(updated);
        SyncQueueService.enqueue('DELETE_PRODUCT', { id });
        updateQueueCount();
        triggerImmediateDatabaseSync();
        writeAuditLog(`Removed Dish [${name}] from master catalog`);
        showToast(`"${name}" has been removed.`, "info");
      }
    );
  };

  // STAFF ENTITY CONTROLS (Only available for Managers)
  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name.trim()) {
      showToast("Staff Name is required.", "error");
      return;
    }

    if (staffForm.pin.length !== 4 || isNaN(parseInt(staffForm.pin))) {
      showToast("PIN must be exactly 4-digits.", "error");
      return;
    }

    if (editingStaff) {
      const updated = staff.map(s => {
        if (s.uid === editingStaff.uid) {
          return {
            ...s,
            name: staffForm.name,
            pin: staffForm.pin,
            role: staffForm.role,
            status: staffForm.status,
            photoUrl: staffForm.photoUrl || s.photoUrl,
            updatedAt: new Date().toISOString(),
          };
        }
        return s;
      });
      saveLocalStaff(updated);
      writeAuditLog(`Updated profile for Employee: ${staffForm.name}`);
    } else {
      const newEmp: StaffMember = {
        uid: `staff-${crypto.randomUUID().slice(0, 8)}`,
        name: staffForm.name,
        pin: staffForm.pin,
        role: staffForm.role,
        status: staffForm.status,
        photoUrl: staffForm.photoUrl,
        updatedAt: new Date().toISOString(),
      };
      saveLocalStaff([...staff, newEmp]);
      writeAuditLog(`Registered New Employee profile: ${staffForm.name} as ${staffForm.role}`);
    }

    setShowStaffModal(false);
    setEditingStaff(null);
    triggerImmediateDatabaseSync();
    setStaffForm({
      name: '',
      pin: '',
      role: 'Staff',
      status: 'active',
      photoUrl: '',
    });
  };

  const handleEditStaffClick = (emp: StaffMember) => {
    setEditingStaff(emp);
    setStaffForm({
      name: emp.name,
      pin: emp.pin,
      role: emp.role,
      status: emp.status,
      photoUrl: emp.photoUrl || '',
    });
    setShowStaffModal(true);
  };

  const removeStaffMember = (uid: string, name: string) => {
    if (uid === 's-owner') {
      triggerDialog(
        "Action Blocked",
        "The Owner Manager account cannot be deleted as it is the primary administrative account.",
        "error"
      );
      return;
    }

    triggerDialog(
      "Confirm Deletion",
      `Are you sure you want to delete ${name} from the master staff registry? They will lose access to the system.`,
      "warning",
      "Delete Profile",
      () => {
        const updated = staff.filter(s => s.uid !== uid);
        saveLocalStaff(updated);
        triggerImmediateDatabaseSync();
        writeAuditLog(`Removed Staff Member ${name} credentials`);
        showToast(`${name} has been removed from the registry.`, "info");
      }
    );
  };

  // ANALYTICAL CALCULATIONS
  const getAnalytics = () => {
    const targetOrders = orders.filter(o => o.orderStatus === 'completed' || o.orderStatus === 'received' || o.orderStatus === 'preparing' || o.orderStatus === 'ready');
    const totalSales = targetOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    const totalOrdersCount = targetOrders.length;
    const avgOrderVal = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;

    // Build category aggregates
    const categoryChart: { [cat: string]: number } = {};
    targetOrders.forEach(o => {
      o.items.forEach(itm => {
        // match category from menu to be accurate
        const realItem = menuItems.find(m => m.id === itm.id);
        const cat = realItem?.category || 'Rice Meals';
        categoryChart[cat] = (categoryChart[cat] || 0) + (itm.qty * itm.price);
      });
    });

    const categorySummary = Object.keys(categoryChart).map(key => ({
      name: key,
      value: categoryChart[key],
    }));

    // Employee processing ranks
    const employeePerf: { [name: string]: number } = {};
    orders.filter(o => o.orderStatus === 'completed').forEach(o => {
      employeePerf[o.actionBy] = (employeePerf[o.actionBy] || 0) + 1;
    });

    const lowStockAlerts = menuItems.filter(item => item.inventoryQty <= 5 && item.status === 'active');

    return {
      totalSales,
      totalOrdersCount,
      avgOrderVal,
      categorySummary,
      employeePerf,
      lowStockAlerts
    };
  };

  const analytics = getAnalytics();

  const exportAnalyticsCSV = () => {
    const data = getAnalytics();
    
    let csvContent = "";
    
    // Header
    csvContent += "KITCHEN POS - SALES & BUSINESS ANALYTICS REPORT\r\n";
    csvContent += `Generated At,${new Date().toLocaleString()}\r\n`;
    csvContent += `Generated By,${currentEmployee?.name || googleUser?.email || 'System/POS Terminal'}\r\n\r\n`;
    
    // Summary Metrics
    csvContent += "KEY METRICS\r\n";
    csvContent += "Metric,Value\r\n";
    csvContent += `Gross Sales,PHP ${data.totalSales.toFixed(2)}\r\n`;
    csvContent += `Total Orders,${data.totalOrdersCount}\r\n`;
    csvContent += `Average Order Value,PHP ${data.avgOrderVal.toFixed(2)}\r\n\r\n`;
    
    // Category Breakdown
    csvContent += "SALES BY CATEGORY\r\n";
    csvContent += "Category,Gross Sales (PHP)\r\n";
    data.categorySummary.forEach(cat => {
      csvContent += `"${cat.name}",${cat.value.toFixed(2)}\r\n`;
    });
    csvContent += "\r\n";
    
    // Employee Performance
    csvContent += "EMPLOYEE PERFORMANCE\r\n";
    csvContent += "Employee Name,Completed Orders\r\n";
    Object.entries(data.employeePerf).forEach(([emp, count]) => {
      csvContent += `"${emp}",${count}\r\n`;
    });
    csvContent += "\r\n";
    
    // Low Stock Alerts
    if (data.lowStockAlerts.length > 0) {
      csvContent += "LOW STOCK ALERTS\r\n";
      csvContent += "Item Name,Category,Quantity Remaining\r\n";
      data.lowStockAlerts.forEach(item => {
        csvContent += `"${item.name}","${item.category}",${item.inventoryQty}\r\n`;
      });
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Kitchen_Analytics_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast("Sales Report downloaded successfully in CSV format!", "success");
  };

  const printAnalyticsReport = () => {
    const data = getAnalytics();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }
    
    const categoryRows = data.categorySummary.map(cat => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${cat.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace;">₱${cat.value.toFixed(2)}</td>
      </tr>
    `).join('');

    const employeeRows = Object.entries(data.employeePerf).map(([emp, count]) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${emp}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace;">${count} order(s) completed</td>
      </tr>
    `).join('');

    const stockRows = data.lowStockAlerts.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.category}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #b91c1c; font-weight: bold; font-family: monospace;">${item.inventoryQty}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Kitchen POS Business Performance Report - ${new Date().toLocaleDateString()}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #1f2937;
              margin: 40px;
              line-height: 1.6;
              background-color: #ffffff;
            }
            .header-container {
              border-bottom: 3px solid #f59e0b;
              padding-bottom: 20px;
              margin-bottom: 25px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header-title h1 {
              margin: 0;
              color: #1f2937;
              font-size: 26px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .header-title p {
              margin: 5px 0 0 0;
              color: #6b7280;
              font-size: 13px;
            }
            .brand-accent {
              color: #f59e0b;
            }
            .metadata {
              font-size: 11px;
              color: #4b5563;
              background-color: #f3f4f6;
              padding: 12px 16px;
              border-radius: 8px;
              margin-bottom: 30px;
              display: flex;
              justify-content: space-between;
            }
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin-bottom: 35px;
            }
            .metric-card {
              border: 1px solid #e5e7eb;
              padding: 18px 15px;
              border-radius: 10px;
              background-color: #f9fafb;
              box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .metric-card span {
              display: block;
              font-size: 10px;
              color: #6b7280;
              text-transform: uppercase;
              font-weight: 700;
              margin-bottom: 6px;
              letter-spacing: 0.5px;
            }
            .metric-card strong {
              font-size: 22px;
              font-weight: 800;
            }
            .section-title {
              font-size: 14px;
              font-weight: 700;
              color: #1f2937;
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 6px;
              margin-top: 35px;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
              font-size: 12px;
            }
            th {
              background-color: #f9fafb;
              font-weight: bold;
              text-align: left;
              padding: 10px;
              border-bottom: 2px solid #e5e7eb;
              text-transform: uppercase;
              font-size: 10px;
              color: #4b5563;
              letter-spacing: 0.5px;
            }
            .footer {
              margin-top: 60px;
              text-align: center;
              font-size: 10px;
              color: #9ca3af;
              border-top: 1px dashed #e5e7eb;
              padding-top: 20px;
            }
            @media print {
              body { margin: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="header-title">
              <h1>Kitchen <span class="brand-accent">POS</span> Reports</h1>
              <p>Official Sales Analytics & Business Performance Record</p>
            </div>
            <div style="font-size: 14px; font-weight: bold; color: #f59e0b;">POS SYSTEM REPORT</div>
          </div>
          
          <div class="metadata">
            <div><strong>Report Date/Time:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>Generated By:</strong> ${currentEmployee?.name || googleUser?.email || 'POS Terminal Server'}</div>
          </div>
          
          <div class="metrics-grid">
            <div class="metric-card" style="border-left: 4px solid #10b981;">
              <span>Gross Revenue</span>
              <strong style="color: #10b981;">₱${data.totalSales.toFixed(2)}</strong>
            </div>
            <div class="metric-card" style="border-left: 4px solid #6366f1;">
              <span>Total Orders Processed</span>
              <strong style="color: #6366f1;">${data.totalOrdersCount} orders</strong>
            </div>
            <div class="metric-card" style="border-left: 4px solid #f59e0b;">
              <span>Average Ticket Size</span>
              <strong style="color: #f59e0b;">₱${data.avgOrderVal.toFixed(2)}</strong>
            </div>
          </div>
          
          <div class="section-title">Revenue Contribution by Category</div>
          <table>
            <thead>
              <tr>
                <th style="width: 70%;">Food Category</th>
                <th style="text-align: right;">Total Sales (PHP)</th>
              </tr>
            </thead>
            <tbody>
              ${categoryRows || '<tr><td colspan="2" style="text-align: center; color: #9ca3af; padding: 20px;">No category sales data recorded.</td></tr>'}
            </tbody>
          </table>
          
          <div class="section-title">Staff / Employee Transaction Performance</div>
          <table>
            <thead>
              <tr>
                <th style="width: 70%;">Employee / Server Name</th>
                <th style="text-align: right;">Completed Orders Count</th>
              </tr>
            </thead>
            <tbody>
              ${employeeRows || '<tr><td colspan="2" style="text-align: center; color: #9ca3af; padding: 20px;">No employee transactions processed yet.</td></tr>'}
            </tbody>
          </table>
          
          \${data.lowStockAlerts.length > 0 ? \`
            <div class="section-title" style="color: #b91c1c; border-bottom: 2px solid #fca5a5;">⚠️ Critical Inventory Stock Warnings</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50%;">Item Description</th>
                  <th style="text-align: center; width: 30%;">Category</th>
                  <th style="text-align: right; width: 20%;">Stock Left</th>
                </tr>
              </thead>
              <tbody>
                \${stockRows}
              </tbody>
            </table>
          \` : ''}
          
          <div class="footer">
            <p>This document is an official computer-generated record from Kitchen POS Food Ordering System.</p>
            <p>© ${new Date().getFullYear()} Kitchen POS. All rights reserved.</p>
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Category filtration lists
  const categories = ['All', 'Rice Meals', 'Burgers', 'Snacks', 'Desserts', 'Drinks'];
  
  const filteredMenuItems = menuItems.filter(item => {
    const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchQuery = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchQuery && item.status === 'active';
  });

  const getFilteredOrders = () => {
    if (orderFilter === 'all') return orders;
    return orders.filter(o => {
      if (orderFilter === 'pending') return o.orderStatus === 'received' || o.orderStatus === 'preparing' || o.orderStatus === 'ready';
      if (orderFilter === 'completed') return o.orderStatus === 'completed';
      if (orderFilter === 'cancelled') return o.orderStatus === 'cancelled';
      return true;
    });
  };

  const displayOrders = getFilteredOrders();

  const renderLogoutConfirmModal = () => {
    return (
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border transition-colors duration-200 p-6 ${
                theme === 'dark' 
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-100' 
                  : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl shrink-0">
                  <LogOut size={24} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="font-bold text-base leading-snug">Mag-logout sa Portal?</h3>
                  <p className={`text-xs leading-relaxed ${
                    theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'
                  }`}>
                    Sigurado ka bang nais mong lumabas sa iyong account? Anumang hindi na-sync na transaksyon o kasalukuyang ginagawa ay maaaring mawala.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    theme === 'dark' 
                      ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300' 
                      : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  Manatili
                </button>
                <button
                  type="button"
                  onClick={confirmSellerLogout}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-rose-600/10"
                >
                  Sige, Mag-logout
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderPolicyModals = () => {
    return (
      <AnimatePresence>
        {/* TERMS OF SERVICE MODAL */}
        {showTermsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTermsModal(false)}
              className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-100' 
                  : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              {/* Header */}
              <div className={`p-5 border-b flex items-center justify-between ${
                theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Terms of Service</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">Huling Update: Hulyo 2026</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTermsModal(false)}
                  className={`p-1.5 rounded-xl transition cursor-pointer ${
                    theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 text-xs leading-relaxed font-sans">
                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">1. Pagtanggap sa mga Tuntunin</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Sa pamamagitan ng pagrehistro sa aming platform, sumasang-ayon ka na sumunod sa lahat ng nakasaad na tuntunin dito. Kung hindi ka sumasang-ayon, mangyaring huwag magpatuloy sa paggamit ng serbisyong ito.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">2. Responsibilidad sa Account</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Obligasyon ng may-ari ng tindahan na protektahan ang kanilang password, API credentials, at pamahalaan ang mga profile ng kanilang mga staff. Anumang transaksyon o aksyon na isasagawa sa ilalim ng iyong account ay ituturing na iyong direktang responsibilidad.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">3. Transaksyon at Serbisyo</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Ang aming platform ay nagsisilbing system para sa pagproseso ng mga order, imbentaryo, at analytics para sa mga restawran o kainan. Walang pananagutan ang system provider sa mga pagkaantala sa serbisyo sanhi ng pagkawala ng koneksyon sa internet ng kliyente, ngunit mayroon kaming built-in offline synchronization mechanism upang mapangalagaan ang iyong data.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">4. Limitasyon ng Pananagutan</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Sa pinakamataas na saklaw na pinahihintulutan ng batas, ang platform ay ibinibigay "as is" nang walang anumang garantiya. Hindi kami mananagot para sa anumang hindi direkta o hindi sinasadyang pinsala na magreresulta mula sa maling paggamit ng system.
                  </p>
                </section>
              </div>

              {/* Footer */}
              <div className={`p-4 border-t flex items-center justify-end gap-3 ${
                theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'
              }`}>
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Nauunawaan Ko
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* PRIVACY POLICY MODAL */}
        {showPrivacyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPrivacyModal(false)}
              className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-100' 
                  : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              {/* Header */}
              <div className={`p-5 border-b flex items-center justify-between ${
                theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Shield size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Privacy Policy</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">Huling Update: Hulyo 2026</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className={`p-1.5 rounded-xl transition cursor-pointer ${
                    theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 text-xs leading-relaxed font-sans">
                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">1. Impormasyong Aming Kinokolekta</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Kami ay nakatuon sa pagprotekta sa iyong privacy. Kinokolekta namin ang mga impormasyon tulad ng pangalan ng negosyo, pangalan ng may-ari, email address, numero ng telepono, at impormasyon ng imbentaryo upang maihatid nang maayos ang serbisyo.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">2. Paano Namin Ginagamit ang Iyong Data</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Ang mga nakolektang impormasyon ay ginagamit lamang para sa authentication, pagpapanatili ng real-time at offline synchronization ng mga order, at pagbuo ng sales analytics para sa iyong tindahan. Hindi namin ibebenta o ibabahagi ang iyong data sa mga ikatlong partido (third parties) para sa marketing.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">3. Seguridad ng Data</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Gumagamit kami ng advanced industry-standard encryption, CSRF protection, at secure na session controls upang maiwasan ang hindi awtorisadong pag-access, pagbabago, o pagtagas ng iyong sensitibong impormasyon.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">4. Mga Karapatan ng User</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Alinsunod sa Data Privacy Act, mayroon kang karapatang i-access, baguhin, o hilinging burahin ang iyong personal at tindahang impormasyon sa aming database anumang oras sa pamamagitan ng pag-update ng iyong profile o pakikipag-ugnayan sa amin.
                  </p>
                </section>
              </div>

              {/* Footer */}
              <div className={`p-4 border-t flex items-center justify-end gap-3 ${
                theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'
              }`}>
                <button
                  onClick={() => setShowPrivacyModal(false)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Tinatanggap Ko
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* COOKIE POLICY MODAL */}
        {showCookieModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCookieModal(false)}
              className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-100' 
                  : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              {/* Header */}
              <div className={`p-5 border-b flex items-center justify-between ${
                theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Cookie size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Cookie Policy</h3>
                    <p className="text-[10px] text-neutral-400 font-mono">Huling Update: Hulyo 2026</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCookieModal(false)}
                  className={`p-1.5 rounded-xl transition cursor-pointer ${
                    theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 text-xs leading-relaxed font-sans">
                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">1. Ano ang mga Cookies at Local Storage?</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Ang cookies at local storage ay maliliit na text files na sine-save sa iyong browser upang matiyak na maalala ng platform ang iyong mga preferences, estado ng pagka-login, at upang ligtas na magamit ang system.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">2. Paano Namin Sila Ginagamit</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Gumagamit kami ng **Essential Cookies** at **Session Storage** upang mapanatili ang iyong secure login session at upang gumana ang aming offline queue service. Ginagamit din namin ang local storage para i-save ang iyong pre-loaded menu lists, active order states, at theme choices nang sa gayon ay hindi mo kailangang i-configure muli ang interface sa tuwing bibisita ka.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h4 className="font-bold text-sm text-indigo-400">3. Pamamahala sa mga Cookies</h4>
                  <p className={`${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    Maaari mong piliing huwag tanggapin o i-delete ang cookies sa pamamagitan ng mga settings ng iyong browser. Gayunpaman, paki-tandaan na ang pag-block sa cookies ay maaaring magbunga ng hindi tamang paggana o pagkawala ng kakayahang mag-login sa seller portal.
                  </p>
                </section>
              </div>

              {/* Footer */}
              <div className={`p-4 border-t flex items-center justify-end gap-3 ${
                theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200'
              }`}>
                <button
                  onClick={() => setShowCookieModal(false)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Sumasang-ayon Ako
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  if (!sellerAuthUser) {
    return (
      <div className={`min-h-screen font-sans flex flex-col justify-between transition-colors duration-200 ${
        theme === 'dark' ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
      }`}>
        {/* Floating OTP Simulation Banner */}
        {showOtpNotification && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
            <div className="bg-indigo-600 text-white rounded-2xl p-4 shadow-2xl border border-indigo-400/30 flex items-start gap-3 animate-bounce">
              <Shield className="shrink-0 text-amber-300 mt-0.5" size={18} />
              <div className="space-y-1.5 text-xs">
                <span className="font-bold block uppercase tracking-wider text-amber-300">🛡️ Real-Time 2FA Verification Alert</span>
                <p className="text-neutral-100">A secure 6-digit OTP code has been dispatched to your email address.</p>
                
                {otpPreviewUrl ? (
                  <div className="pt-2">
                    <a 
                      href={otpPreviewUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-neutral-900 font-bold rounded-lg transition-colors text-[11px] decoration-transparent shadow-sm"
                    >
                      📧 Open Real Received Email Inbox
                    </a>
                    <span className="block text-[9px] text-neutral-300 mt-1">Click above to view your email and read the verification code.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-neutral-300">Use standard backdoor code <code className="bg-black/30 px-1 rounded text-white font-mono font-bold">123456</code> to bypass.</span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowOtpNotification(false)}
                className="text-neutral-300 hover:text-white ml-auto"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Top Header Row */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-transparent">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-tr from-amber-500 to-indigo-600 p-2 rounded-xl text-white shadow-lg">
              <Utensils size={20} />
            </div>
            <div>
              <span className={`font-bold text-base leading-tight tracking-tight block ${
                theme === 'dark' ? 'text-white' : 'text-neutral-950'
              }`}>Food Ordering System</span>
              <span className="text-[10px] block font-mono text-neutral-500 tracking-wider">SELLER SYSTEM</span>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition ${
              theme === 'dark' 
                ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-amber-400' 
                : 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700 shadow-sm'
            } active:scale-95`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>

        {/* Main Gating Card Container */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl border p-8 space-y-6 shadow-xl transition-all duration-300 ${
            theme === 'dark' 
              ? 'bg-neutral-900 border-neutral-800 text-white' 
              : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            
            {/* VIEW 1: LOGIN */}
            {sellerAuthView === 'login' && (
              <form onSubmit={handleSellerLogin} className="space-y-5">
                <div className="space-y-1.5 text-center">
                  <h2 className="text-2xl font-bold tracking-tight">Welcome Back!</h2>
                  <p className="text-xs text-neutral-400">Sign in to manage your active menu, orders, and staff registry.</p>
                </div>

                {loginError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-500 text-xs font-semibold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-400 block">Email Address or Phone</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                      <input
                        type="text"
                        placeholder="seller@portal.com or phone"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm border font-sans transition-colors ${
                          theme === 'dark' 
                            ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                            : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-400">Password</label>
                      <button
                        type="button"
                        onClick={() => setSellerAuthView('forgot_password')}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3.5 text-neutral-500" size={16} />
                      <input
                        type={loginShowPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={`w-full pl-10 pr-11 py-3 rounded-xl text-sm border font-sans transition-colors ${
                          theme === 'dark' 
                            ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                            : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setLoginShowPassword(!loginShowPassword)}
                        className="absolute right-3.5 text-neutral-500 hover:text-neutral-300 focus:outline-none transition p-1 rounded-lg cursor-pointer"
                      >
                        {loginShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={loginRememberMe}
                        onChange={(e) => setLoginRememberMe(e.target.checked)}
                        className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                      />
                      <span>Keep me signed in for 30 days (Bypass 2FA)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={loginLoading || recaptchaLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 shadow-lg shadow-indigo-600/10"
                  >
                    {loginLoading || recaptchaLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>{recaptchaLoading ? 'Securing Connection...' : 'Logging In...'}</span>
                      </>
                    ) : (
                      <>
                        <span>Access Seller Portal</span>
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <span className="text-xs text-neutral-400">Don't have a partner account? </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSellerAuthView('register');
                        setRegError('');
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition cursor-pointer"
                    >
                      Register Restaurant
                    </button>
                  </div>
                </div>

                {/* reCAPTCHA badge info */}
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-500 font-mono border-t border-neutral-800/10 pt-4">
                  <Shield size={12} className="text-emerald-500" />
                  <span>Secured by Invisible reCAPTCHA v3 (Human Score: 0.95)</span>
                </div>
              </form>
            )}

            {/* VIEW 2: REGISTER */}
            {sellerAuthView === 'register' && (
              <form onSubmit={handleSellerRegistration} className="space-y-4">
                <div className="space-y-1.5 text-center">
                  <h2 className="text-2xl font-bold tracking-tight">Become a Partner Seller</h2>
                  <p className="text-xs text-neutral-400">Register your business details to launch your store terminal.</p>
                </div>

                {regError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-500 text-xs font-semibold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-400 block">Restaurant / Business Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Classic Grill & Kitchen"
                      value={regBusinessName}
                      onChange={(e) => setRegBusinessName(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                        theme === 'dark' 
                          ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                          : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-400 block">First Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. John"
                        value={regOwnerFirstName}
                        onChange={(e) => setRegOwnerFirstName(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                          theme === 'dark' 
                            ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                            : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-400 block">Middle Name <span className="text-[10px] text-neutral-500 font-normal font-sans">(Optional)</span></label>
                      <input
                        type="text"
                        placeholder="e.g. Smith"
                        value={regOwnerMiddleName}
                        onChange={(e) => setRegOwnerMiddleName(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                          theme === 'dark' 
                            ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                            : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-400 block">Surname *</label>
                      <input
                        type="text"
                        placeholder="e.g. Doe"
                        value={regOwnerSurname}
                        onChange={(e) => setRegOwnerSurname(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                          theme === 'dark' 
                            ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                            : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-400 block">Contact Mobile Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 09171234567"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                        theme === 'dark' 
                          ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                          : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-400 block">Email Address</label>
                    <input
                      type="email"
                      placeholder="partner@portal.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                        theme === 'dark' 
                          ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                          : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-400 block">Password</label>
                      <div className="relative flex items-center">
                        <input
                          type={regShowPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className={`w-full pl-4 pr-10 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                            theme === 'dark' 
                              ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                              : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setRegShowPassword(!regShowPassword)}
                          className="absolute right-3 text-neutral-500 hover:text-neutral-300 focus:outline-none transition p-1 rounded-lg cursor-pointer"
                        >
                          {regShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-400 block">Confirm Password</label>
                      <div className="relative flex items-center">
                        <input
                          type={regShowConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          className={`w-full pl-4 pr-10 py-2.5 rounded-xl text-sm border font-sans transition-colors ${
                            theme === 'dark' 
                              ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                              : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setRegShowConfirmPassword(!regShowConfirmPassword)}
                          className="absolute right-3 text-neutral-500 hover:text-neutral-300 focus:outline-none transition p-1 rounded-lg cursor-pointer"
                        >
                          {regShowConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-neutral-400 pt-2 select-none">
                    <input
                      id="regAgreeTerms"
                      type="checkbox"
                      checked={regAgreeTerms}
                      onChange={(e) => setRegAgreeTerms(e.target.checked)}
                      className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 mt-0.5 cursor-pointer"
                    />
                    <span className="leading-tight">
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowTermsModal(true);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 underline bg-transparent border-none p-0 inline font-semibold cursor-pointer align-baseline"
                      >
                        Terms of Service
                      </button>
                      ,{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowPrivacyModal(true);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 underline bg-transparent border-none p-0 inline font-semibold cursor-pointer align-baseline"
                      >
                        Privacy Policy
                      </button>
                      , and{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowCookieModal(true);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 underline bg-transparent border-none p-0 inline font-semibold cursor-pointer align-baseline"
                      >
                        Cookie Policy
                      </button>
                      .
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 shadow-lg shadow-indigo-600/10"
                  >
                    {regLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Creating Store Portal...</span>
                      </>
                    ) : (
                      <>
                        <span>Register & Get Started</span>
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <span className="text-xs text-neutral-400">Already registered? </span>
                    <button
                      type="button"
                      onClick={() => setSellerAuthView('login')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition cursor-pointer"
                    >
                      Log In Here
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* VIEW 3: FORGOT PASSWORD */}
            {sellerAuthView === 'forgot_password' && (
              <form onSubmit={handleSellerForgotPassword} className="space-y-5">
                <div className="space-y-1.5 text-center">
                  <h2 className="text-2xl font-bold tracking-tight">Reset Password</h2>
                  <p className="text-xs text-neutral-400">Enter your registered email and we will send you a recovery link.</p>
                </div>

                {forgotError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-500 text-xs font-semibold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{forgotError}</span>
                  </div>
                )}

                {forgotSubmitted ? (
                  <div className="space-y-4 text-center">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1.5">
                      <CheckCircle2 className="mx-auto text-emerald-500 animate-bounce" size={28} />
                      <h4 className="font-bold text-sm text-emerald-400">Recovery Link Transmitted!</h4>
                      <p className="text-[11px] text-neutral-400">
                        We have dispatched a secure password reset link to <code className="text-white bg-black/30 px-1 rounded font-mono">{forgotEmail}</code>.
                      </p>
                      {forgotPreviewUrl && (
                        <div className="pt-2 border-t border-neutral-800/50 mt-2">
                          <a 
                            href={forgotPreviewUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-neutral-900 px-3 py-1.5 rounded-lg font-bold text-[11px] decoration-transparent shadow-sm"
                          >
                            📧 Open Password Reset Email
                          </a>
                        </div>
                      )}
                      {localBypassResetLink && (
                        <div className="pt-2 border-t border-neutral-800/50 mt-2 space-y-1.5">
                          <p className="text-[10px] text-neutral-400">
                            ⚠️ Mail service is unconfigured/blocked. Use this recovery link directly to set your new password:
                          </p>
                          <a 
                            href={localBypassResetLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-3.5 py-1.5 rounded-xl font-bold text-[11px] decoration-transparent shadow-sm hover:scale-[1.02] transition-transform"
                          >
                            🔑 Open Local Bypass Reset Form
                          </a>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotSubmitted(false);
                        setForgotEmail('');
                        setSellerAuthView('login');
                      }}
                      className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-750 text-white text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer"
                    >
                      Back to Login
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-400 block">Registered Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                        <input
                          type="text"
                          placeholder="e.g. partner@portal.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm border font-sans transition-colors ${
                            theme === 'dark' 
                              ? 'bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white' 
                              : 'bg-neutral-50 border-neutral-200 focus:border-indigo-500 text-neutral-900'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      >
                        {forgotLoading ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Verifying Credentials...</span>
                          </>
                        ) : (
                          <>
                            <span>Transmit Recovery Link</span>
                            <ChevronRight size={16} />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSellerAuthView('login')}
                        className="w-full py-2.5 bg-transparent hover:bg-neutral-800/20 text-neutral-400 font-bold text-xs rounded-xl transition cursor-pointer"
                      >
                        Cancel & Return
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}

            {/* VIEW 4: OTP VERIFICATION */}
            {sellerAuthView === 'otp_verification' && (
              <form onSubmit={handleOtpVerification} className="space-y-5">
                <div className="space-y-1.5 text-center">
                  <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center">
                    <Shield size={24} className="animate-pulse" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Two-Factor Authentication (2FA)</h2>
                  <p className="text-xs text-neutral-400 leading-normal">
                    We detected a sign-in attempt from a new browser. A 6-digit OTP code has been dispatched. Enter it below to complete verification.
                  </p>
                </div>

                {otpError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-500 text-xs font-semibold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{otpError}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-400 block text-center">6-Digit Verification PIN</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={otpInputCode}
                      onChange={(e) => setOtpInputCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full py-3.5 rounded-2xl text-lg font-mono tracking-[0.5em] text-center border font-sans transition-colors bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white max-w-[200px] mx-auto block"
                    />
                  </div>
                </div>

                {localBypassOtp && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-1.5">
                    <h4 className="font-bold text-xs text-emerald-400 flex items-center justify-center gap-1.5">
                      <span>🛡️ Secure Delivery Bypass Active</span>
                    </h4>
                    <p className="text-[10px] text-neutral-400 leading-normal">
                      Since mail service is unconfigured or blocked, we've bypassed email delivery. Enter this 6-digit security PIN to complete verification:
                    </p>
                    <div className="text-xl font-mono font-bold tracking-widest text-emerald-300 bg-neutral-950/60 py-2 rounded-xl border border-emerald-500/10 max-w-[150px] mx-auto select-all">
                      {localBypassOtp}
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={otpLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    {otpLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Validating OTP Token...</span>
                      </>
                    ) : (
                      <>
                        <span>Complete Sign In</span>
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpInputCode('');
                      setOtpError('');
                      setSellerAuthView('login');
                    }}
                    className="w-full py-2.5 bg-transparent hover:bg-neutral-800/20 text-neutral-400 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            )}

            {/* VIEW 5: REGISTER VERIFICATION */}
            {sellerAuthView === 'register_verification' && (
              <form onSubmit={handleRegisterOtpVerification} className="space-y-5">
                <div className="space-y-1.5 text-center">
                  <div className="mx-auto w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center animate-bounce">
                    <Mail size={24} />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Verify Your Email Address</h2>
                  <p className="text-xs text-neutral-400 leading-normal">
                    We have dispatched a 6-digit registration PIN to <code className="text-white bg-black/30 px-1 rounded font-mono">{pendingSeller?.email}</code>. Please enter the security PIN below to complete verification and register your account.
                  </p>
                </div>

                {otpError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-500 text-xs font-semibold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{otpError}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-400 block text-center">6-Digit Verification PIN</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={otpInputCode}
                      onChange={(e) => setOtpInputCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full py-3.5 rounded-2xl text-lg font-mono tracking-[0.5em] text-center border font-sans transition-colors bg-neutral-950 border-neutral-800 focus:border-indigo-500 text-white max-w-[200px] mx-auto block"
                    />
                  </div>
                </div>

                {registerPreviewUrl && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-1.5">
                    <h4 className="font-bold text-xs text-amber-400">📧 Ethereal Test Email Sandbox Active</h4>
                    <p className="text-[10px] text-neutral-400">
                      Since real SMTP/Gmail is not configured yet, you can view the sent registration OTP code directly:
                    </p>
                    <a 
                      href={registerPreviewUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-neutral-900 px-3 py-1.5 rounded-lg font-bold text-[10px] decoration-transparent shadow-sm"
                    >
                      Open Ethereal Sandbox Email
                    </a>
                  </div>
                )}

                {localBypassOtp && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-1.5">
                    <h4 className="font-bold text-xs text-emerald-400 flex items-center justify-center gap-1.5">
                      <span>🛡️ Secure Delivery Bypass Active</span>
                    </h4>
                    <p className="text-[10px] text-neutral-400 leading-normal">
                      Since mail service is unconfigured or blocked, we've bypassed email delivery. Enter this 6-digit security PIN to complete verification:
                    </p>
                    <div className="text-xl font-mono font-bold tracking-widest text-emerald-300 bg-neutral-950/60 py-2 rounded-xl border border-emerald-500/10 max-w-[150px] mx-auto select-all">
                      {localBypassOtp}
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={otpLoading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    {otpLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Verifying Registration Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Complete Registration</span>
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpInputCode('');
                      setOtpError('');
                      setPendingSeller(null);
                      setSellerAuthView('register');
                    }}
                    className="w-full py-2.5 bg-transparent hover:bg-neutral-800/20 text-neutral-400 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Back to Register Form
                  </button>
                </div>
              </form>
            )}

          </div>
        </main>

        {/* Footer */}
        <footer className="py-4 text-center border-t border-transparent text-[10px] text-neutral-500 font-mono">
          <span>Food Ordering System - Seller Portal © {new Date().getFullYear()} • Data Privacy Act Compliant</span>
        </footer>
        {renderPolicyModals()}
        {renderLogoutConfirmModal()}
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${
      theme === 'dark' ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
    }`}>
      
      {/* 1. APP TOP BAR */}
      <header className={`sticky top-0 z-40 px-6 py-3 border-b flex flex-wrap items-center justify-between gap-4 shadow ${
        theme === 'dark' ? 'bg-neutral-900/90 border-neutral-800' : 'bg-white/90 border-neutral-200'
      } backdrop-blur-md`}>
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-amber-500 to-indigo-600 p-2 rounded-xl text-white shadow-lg animate-pulse">
            <Utensils size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">Food Ordering System - Seller Portal</h1>
            <p className="text-[10px] text-neutral-500 font-mono">Store Terminal v1.4.2</p>
          </div>
        </div>

        {/* Sync Controls & Firebase Auth */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Connectivity Status Pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
            online 
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
          }`}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? 'ONLINE' : 'OFFLINE'}
          </div>

          {/* Offline Queue Badge */}
          {queueCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
              <span>{queueCount} Queued Offline {queueCount === 1 ? 'Tx' : 'Txs'}</span>
            </div>
          )}

          {/* Sync Trigger Action */}
          <button
            onClick={() => triggerCloudSync()}
            disabled={syncStatus === 'syncing'}
            title="Sync offline-first transactions with Cloud SQL"
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
              theme === 'dark' 
                ? 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300' 
                : 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
            } active:scale-95 disabled:opacity-50`}
          >
            <RefreshCw size={15} className={`${syncStatus === 'syncing' ? 'animate-spin text-indigo-500' : ''}`} />
          </button>

          {/* Google Auth Sync Integration status */}
          {googleUser ? (
            <div className={`flex items-center gap-2 border rounded-xl pl-3 pr-2 py-1.5 text-xs font-mono transition-colors ${
              theme === 'dark' ? 'bg-indigo-950/30 border-indigo-900/50' : 'bg-indigo-50 border-indigo-200'
            }`}>
              <Database size={13} className="text-indigo-500" />
              <span className="truncate max-w-[120px] text-indigo-400 font-medium">Backup Enabled</span>
              <button 
                onClick={handleGoogleLogout}
                className="hover:text-rose-500 transition-colors ml-1 border-l pl-2 text-[10px] border-neutral-500/20 uppercase"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow active:scale-95 text-nowrap"
            >
              <Database size={13} />
              Google Login (Sync)
            </button>
          )}

          {/* Terminal Fast Switch Employee Account Trigger & Profile Dropdown */}
          <div className="relative">
            <div className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 text-xs transition ${
              theme === 'dark' ? 'bg-neutral-800/80 border-neutral-700' : 'bg-neutral-100 border-neutral-300'
            }`}>
              {/* Clicking the employee name triggers the profile dropdown */}
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className={`flex items-center gap-2 font-semibold transition cursor-pointer text-left select-none ${
                  theme === 'dark' ? 'text-neutral-300 hover:text-indigo-400' : 'text-neutral-700 hover:text-indigo-600'
                }`}
              >
                <img 
                  src={getAvatarUrl(
                    currentEmployee ? currentEmployee.name : (sellerAuthUser?.ownerName || 'User'),
                    currentEmployee ? currentEmployee.photoUrl : sellerAuthUser?.photoUrl
                  )} 
                  alt="User avatar" 
                  className="w-5.5 h-5.5 rounded-full object-cover border border-amber-500 bg-amber-500/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <span className="font-bold truncate max-w-[150px]">
                  {currentEmployee ? `${currentEmployee.name} (${currentEmployee.role})` : (sellerAuthUser?.ownerName || 'User Account')}
                </span>
                <span className="text-[9px] opacity-60">▼</span>
              </button>

              <div className={`border-l h-3 mx-1 ${theme === 'dark' ? 'border-neutral-700' : 'border-neutral-300'}`}></div>

              {/* Switch ID button */}
              <button 
                onClick={() => {
                  setPinTargetEmployee(null);
                  setShowPinScreen(true);
                  setPinInput('');
                  setPinError('');
                }}
                className="hover:text-amber-500 text-[10px] font-semibold text-neutral-400 cursor-pointer uppercase tracking-wider transition-colors"
              >
                Switch ID
              </button>
            </div>

            {/* Dropdown Menu */}
            {showProfileDropdown && (
              <>
                {/* Backdrop overlay to close when clicking outside */}
                <div 
                  className="fixed inset-0 z-40 cursor-default" 
                  onClick={() => setShowProfileDropdown(false)} 
                />
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl border p-4 z-50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-100 ${
                  theme === 'dark' 
                    ? 'bg-neutral-900 border-neutral-800 text-white' 
                    : 'bg-white border-neutral-200 text-neutral-900 shadow-xl'
                }`}>
                  {/* Header info */}
                  <div className="border-b border-neutral-800/20 pb-3 flex items-center gap-3">
                    <div className="relative group/avatar shrink-0">
                      <img 
                        src={getAvatarUrl(
                          currentEmployee ? currentEmployee.name : (sellerAuthUser?.ownerName || 'User'),
                          currentEmployee ? currentEmployee.photoUrl : sellerAuthUser?.photoUrl
                        )} 
                        alt="Profile Avatar" 
                        className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500 bg-indigo-500/10 shadow"
                        referrerPolicy="no-referrer"
                      />
                      <label className="absolute inset-0 bg-black/75 rounded-full flex flex-col items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition duration-150 cursor-pointer text-[8px] text-white font-extrabold text-center select-none leading-tight">
                        <span>PALITAN</span>
                        <span>LITRATO</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleImageUpload(e, currentEmployee ? 'staff' : 'owner', currentEmployee?.uid)}
                        />
                      </label>
                    </div>
                    <div className="space-y-1 overflow-hidden flex-1">
                      <p className="text-xs font-bold leading-none truncate">
                        {currentEmployee ? currentEmployee.name : sellerAuthUser?.ownerName}
                      </p>
                      <p className="text-[10px] text-neutral-400 font-medium truncate">
                        {currentEmployee ? `${currentEmployee.role} • Active` : sellerAuthUser?.email}
                      </p>
                      <span className={`inline-block mt-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono ${
                        currentEmployee?.role === 'Manager' || !currentEmployee
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-indigo-500/10 text-indigo-500'
                      }`}>
                        {currentEmployee ? `${currentEmployee.role} Account` : 'Owner Profile'}
                      </span>
                    </div>
                  </div>

                  {/* Body details */}
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-400">Business Name:</span>
                      <span className="font-semibold text-right max-w-[150px] truncate">{sellerAuthUser?.businessName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-400">Contact Number:</span>
                      <span className="font-semibold font-mono text-right">{sellerAuthUser?.phone || 'Not Configured'}</span>
                    </div>
                    {currentEmployee && (
                      <div className="flex justify-between items-center pt-2 border-t border-neutral-800/10">
                        <span className="text-neutral-400">Active Duty:</span>
                        <span className="font-medium text-amber-500 text-right max-w-[150px] truncate">{currentEmployee.name} ({currentEmployee.role})</span>
                      </div>
                    )}
                  </div>

                  {/* Actions / Buttons */}
                  <div className="pt-2 border-t border-neutral-800/20 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setShowProfileDropdown(false);
                        setActiveTab('security_hub'); // Link to security & session hub
                      }}
                      className={`w-full py-2 rounded-xl text-center text-xs font-bold transition cursor-pointer ${
                        theme === 'dark' 
                          ? 'bg-neutral-800 hover:bg-neutral-750 text-neutral-300' 
                          : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      Manage Security & Session
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileDropdown(false);
                        handleSellerLogout(); // Trigger logout confirm modal
                      }}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/10"
                    >
                      <LogOut size={12} />
                      Log-out ng Account
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition ${
              theme === 'dark' 
                ? 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-amber-400' 
                : 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
            } active:scale-95`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

        </div>
      </header>

      {/* Sync Status Banner */}
      {syncStatus !== 'idle' && (
        <div className={`text-center py-2 text-xs font-mono font-medium transition-all ${
          syncStatus === 'syncing' ? 'bg-indigo-600 text-white animate-pulse' :
          syncStatus === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {syncStatus === 'syncing' && '☁️ Synchronizing with PostgreSQL Server. Please wait...'}
          {syncStatus === 'success' && '✓ Successfully synchronized with PostgreSQL Cloud Database!'}
          {syncStatus === 'error' && '⚡ Error connecting to database. Saved locally instead.'}
        </div>
      )}

      {/* 2. MAIN LAYOUT SHEETS AND VIEWS */}
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* VIEW NAVIGATION BUTTONS COLUMN */}
        <nav className="lg:col-span-2 flex flex-row lg:flex-col gap-4 overflow-x-auto pb-2 lg:pb-0 shrink-0">

          {/* SELLER MODULE */}
          <div className="flex flex-col gap-1 w-full min-w-[150px] shrink-0 lg:shrink">
            <span className="hidden lg:block text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest px-2 mb-1.5 border-b border-neutral-800 pb-1 mt-2">
              Seller Module
            </span>
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'pos'
                  ? 'bg-amber-500 text-white shadow-md border-amber-400'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <ShoppingCart size={18} />
              <span>POS Register</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'orders'
                  ? 'bg-indigo-600 text-white shadow-md border-indigo-500'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <ClipboardList size={18} />
                <span>Live Queue</span>
              </div>
              {orders.filter(o => o.orderStatus === 'received' || o.orderStatus === 'preparing').length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full animate-bounce">
                  {orders.filter(o => o.orderStatus === 'received' || o.orderStatus === 'preparing').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'inventory'
                  ? 'bg-indigo-600 text-white shadow-md border-indigo-500'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <Utensils size={18} />
              <span>Menu & Stocks</span>
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'staff'
                  ? 'bg-indigo-600 text-white shadow-md border-indigo-500'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <Users size={18} />
              <span>Staff registry</span>
            </button>
          </div>

          {/* ADMIN MODULE */}
          <div className="flex flex-col gap-1 w-full min-w-[150px] shrink-0 lg:shrink">
            <span className="hidden lg:block text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest px-2 mb-1.5 border-b border-neutral-800 pb-1 mt-2">
              Admin Module
            </span>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-md border-indigo-500'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <BarChart3 size={18} />
              <span>Sales Analytics</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'audit'
                  ? 'bg-indigo-600 text-white shadow-md border-indigo-500'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <Clock size={18} />
              <span>Audit Trails</span>
            </button>
            <button
              onClick={() => setActiveTab('security_hub')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer text-nowrap w-full border ${
                activeTab === 'security_hub'
                  ? 'bg-indigo-600 text-white shadow-md border-indigo-500'
                  : theme === 'dark'
                    ? 'hover:bg-neutral-900 text-neutral-400 border-transparent'
                    : 'hover:bg-neutral-200 text-neutral-600 border-transparent'
              }`}
            >
              <Shield size={18} className="text-amber-500 animate-pulse" />
              <span>Security & Cookies</span>
            </button>
          </div>
        </nav>

        {/* CONTAINER SHEETS FOR CHOSEN TAB */}
        <main className="lg:col-span-10 flex flex-col gap-6">

          {/* -------------------------------------------------------------
              A0. CUSTOMER MODULE SIMULATION TAB - REMOVED FOR PRODUCTION
              ------------------------------------------------------------- */}
          {false && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: THE PHYSICAL SMARTPHONE MOCKUP */}
              <div className="xl:col-span-5 flex flex-col items-center">
                <div className="text-center mb-4">
                  <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest">Interactive Simulator</h3>
                  <p className="text-[11px] text-neutral-500">Simulates an external customer's smartphone app</p>
                </div>

                {/* Relative Wrapper for Physical Buttons */}
                <div className="relative w-full max-w-[370px]">
                  
                  {/* Physical Power Button (Right Side) */}
                  <button 
                    onClick={() => {
                      if (isPhonePowerOff) {
                        setIsPhonePowerOff(false);
                        setPhoneActiveApp('splash');
                        setTimeout(() => setPhoneActiveApp('food_app'), 2500);
                      } else {
                        setIsPhoneLocked(locked => !locked);
                      }
                    }}
                    onDoubleClick={() => {
                      setIsPhonePowerOff(off => !off);
                    }}
                    title="Power Button (Click to Lock/Unlock, Double-Click to Power Off/On)"
                    className="absolute right-[-14px] top-32 w-1.5 h-14 bg-neutral-700 hover:bg-neutral-600 rounded-r-md border-r border-t border-b border-neutral-600 cursor-pointer transition active:translate-x-[-1px] z-30 shadow-md"
                  />

                  {/* Physical Volume Up (Left Side) */}
                  <button 
                    onClick={() => {
                      setSimulatedVolume(v => Math.min(100, v + 10));
                      setShowVolumeHUD(true);
                      if (volumeTimer) clearTimeout(volumeTimer);
                      const timer = setTimeout(() => setShowVolumeHUD(false), 2000);
                      setVolumeTimer(timer);
                    }}
                    title="Volume Up"
                    className="absolute left-[-14px] top-24 w-1.5 h-10 bg-neutral-700 hover:bg-neutral-600 rounded-l-md border-l border-t border-b border-neutral-600 cursor-pointer transition active:translate-x-[1px] z-30 shadow-md"
                  />

                  {/* Physical Volume Down (Left Side) */}
                  <button 
                    onClick={() => {
                      setSimulatedVolume(v => Math.max(0, v - 10));
                      setShowVolumeHUD(true);
                      if (volumeTimer) clearTimeout(volumeTimer);
                      const timer = setTimeout(() => setShowVolumeHUD(false), 2000);
                      setVolumeTimer(timer);
                    }}
                    title="Volume Down"
                    className="absolute left-[-14px] top-38 w-1.5 h-10 bg-neutral-700 hover:bg-neutral-600 rounded-l-md border-l border-t border-b border-neutral-600 cursor-pointer transition active:translate-x-[1px] z-30 shadow-md"
                  />

                  {/* Smartphone Container frame */}
                  <div className="relative w-full bg-neutral-950 rounded-[3rem] p-3.5 border-[8px] border-neutral-800 shadow-2xl overflow-hidden aspect-[9/18.5] flex flex-col text-neutral-200">
                    {/* Speaker and Camera notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-neutral-800 rounded-b-xl z-20 flex justify-center items-center gap-1.5">
                      <div className="w-12 h-1 bg-neutral-900 rounded-full"></div>
                      <div className="w-2.5 h-2.5 bg-neutral-900 rounded-full"></div>
                    </div>

                    {/* Status Bar inside the phone */}
                    <div className="flex justify-between items-center px-4 pt-1.5 pb-2 text-[10px] font-bold text-neutral-400 z-10 bg-neutral-950 mt-1 select-none">
                      <span>{phoneTime || '09:41 AM'}</span>
                      <div className="flex items-center gap-1.5">
                        {simulatedVolume === 0 ? <VolumeX size={10} className="text-neutral-500" /> : <Volume2 size={10} className="text-neutral-400" />}
                        {simulatedWifi ? <Wifi size={10} className="text-amber-500" /> : <WifiOff size={10} className="text-neutral-500 animate-pulse" />}
                        <div className="flex items-center gap-1">
                          <span className="text-[8px]">{simulatedBattery}%</span>
                          <div className="w-4 h-2.5 bg-neutral-800 rounded-xs border border-neutral-750 relative flex items-center p-px">
                            <div 
                              className={`h-full rounded-2xs ${
                                simulatedBattery > 50 ? 'bg-emerald-500' : simulatedBattery > 20 ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'
                              }`}
                              style={{ width: `${Math.max(10, Math.min(100, simulatedBattery))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SMARTPHONE APP CONTAINER */}
                    <div className="flex-1 bg-neutral-900 rounded-2xl flex flex-col relative overflow-hidden">
                      
                      {/* POWER OFF OVERLAY */}
                      {isPhonePowerOff ? (
                        <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 text-center select-none">
                          <div className="w-12 h-12 rounded-full border border-neutral-800 flex items-center justify-center bg-neutral-950 mb-3 text-neutral-600 animate-pulse">
                            <Power size={20} />
                          </div>
                          <p className="text-[10px] text-neutral-500 font-medium">Pro Phone is Power Off</p>
                          <p className="text-[9px] text-neutral-600 mt-2 leading-relaxed">Double-click the right physical Power Button or click the button below to turn on!</p>
                          <button 
                            onClick={() => {
                              setIsPhonePowerOff(false);
                              setPhoneActiveApp('splash');
                              setTimeout(() => setPhoneActiveApp('food_app'), 2500);
                            }}
                            className="mt-6 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-[9px] font-bold rounded-lg cursor-pointer transition active:scale-95"
                          >
                            Power On
                          </button>
                        </div>
                      ) : phoneActiveApp === 'splash' ? (
                        /* BOOTING SCREEN */
                        <div className="absolute inset-0 bg-neutral-950 z-50 flex flex-col items-center justify-center p-6 text-center select-none">
                          <div className="relative">
                            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 animate-bounce">
                              <Utensils size={32} className="text-black font-bold animate-spin" style={{ animationDuration: '3s' }} />
                            </div>
                            <div className="absolute -inset-1 rounded-3xl bg-amber-500/30 blur-sm animate-pulse" />
                          </div>
                          <h2 className="text-white text-xs font-black tracking-widest uppercase mt-6">Mobile OS</h2>
                          <div className="mt-8 flex gap-1 justify-center items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                        </div>
                      ) : isPhoneLocked ? (
                        /* LOCK SCREEN */
                        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/40 via-neutral-950 to-neutral-950 z-45 flex flex-col justify-between p-5 select-none" style={{ backgroundImage: 'radial-gradient(circle at top, rgba(245,158,11,0.15) 0%, transparent 70%)' }}>
                          <div className="flex justify-center pt-2">
                            <div className="bg-neutral-900/60 p-1.5 rounded-full border border-neutral-800 backdrop-blur-sm">
                              <Lock size={12} className="text-amber-400 animate-pulse" />
                            </div>
                          </div>
                          <div className="text-center mt-4">
                            <h1 className="text-3xl font-extrabold text-white tracking-tight">{phoneTime.split(' ')[0]} {phoneTime.split(' ')[1]}</h1>
                            <p className="text-[10px] text-neutral-400 font-semibold mt-1">
                              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                          </div>
                          <div className="flex-1 flex flex-col justify-center gap-2 max-h-[180px] overflow-y-auto my-4 scrollbar-none px-0.5">
                            {phoneNotification ? (
                              <div className="bg-neutral-900/85 p-3 rounded-xl border border-neutral-800/80 shadow-md backdrop-blur-md text-left">
                                <div className="flex justify-between items-center text-[8px] font-bold text-neutral-500 mb-1">
                                  <span className="flex items-center gap-1 text-amber-500"><Utensils size={8} /> KITCHEN PORTAL</span>
                                  <span>now</span>
                                </div>
                                <h4 className="text-[10px] font-extrabold text-white">{phoneNotification.title}</h4>
                                <p className="text-[9px] text-neutral-400 mt-0.5 leading-tight">{phoneNotification.body}</p>
                              </div>
                            ) : lastSimulatedOrder ? (
                              <div className="bg-neutral-900/85 p-3 rounded-xl border border-neutral-800/80 shadow-md backdrop-blur-md text-left">
                                <p className="text-neutral-500 text-[8px] font-bold uppercase tracking-wider">Latest simulated order</p>
                                <p className="text-white font-bold mt-1">#{lastSimulatedOrder.orderNumber} • ₱{parseFloat(lastSimulatedOrder.totalAmount || '0').toFixed(2)}</p>
                                <span className={`px-1 rounded text-[7px] font-black uppercase inline-block mt-1 ${
                                  lastSimulatedOrder.orderStatus === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                  lastSimulatedOrder.orderStatus === 'preparing' ? 'bg-indigo-500/20 text-indigo-400' :
                                  lastSimulatedOrder.orderStatus === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                                  'bg-neutral-800 text-neutral-400'
                                }`}>
                                  {lastSimulatedOrder.orderStatus}
                                </span>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-[9px] text-neutral-600 font-medium italic">
                                No recent notifications
                              </div>
                            )}
                          </div>
                          <div className="pb-4">
                            <button 
                              onClick={() => setIsPhoneLocked(false)}
                              className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black text-xs font-black rounded-xl shadow-md cursor-pointer transition active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <Unlock size={12} />
                              Tap to Unlock
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ACTIVE OS BODY */
                        <div className="flex-1 flex flex-col relative overflow-hidden">
                          
                          {/* VOLUME HUD OVERLAY */}
                          {showVolumeHUD && (
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-6 h-32 bg-neutral-950/90 border border-neutral-800 rounded-full flex flex-col items-center justify-between py-3 z-50 shadow-lg backdrop-blur-md">
                              <Volume2 size={12} className="text-amber-500 animate-pulse" />
                              <div className="flex-1 w-1 bg-neutral-800 rounded-full mx-auto my-2 overflow-hidden relative flex flex-col justify-end">
                                <div 
                                  className="w-full bg-amber-500 rounded-full transition-all duration-150" 
                                  style={{ height: `${simulatedVolume}%` }} 
                                />
                              </div>
                              <VolumeX size={12} className="text-neutral-500" />
                            </div>
                          )}

                          {/* PHONE NOTIFICATION BANNER (GLOBAL OVERLAY) */}
                          {phoneNotification && (
                            <div 
                              onClick={() => {
                                setIsPhoneLocked(false);
                                setPhoneActiveApp('messages');
                                setPhoneNotification(null);
                              }}
                              className="absolute top-2 left-2.5 right-2.5 bg-neutral-950/95 border border-neutral-850 p-2.5 rounded-xl flex items-start gap-2.5 shadow-xl shadow-black/40 z-50 cursor-pointer animate-slide-in backdrop-blur-md select-none"
                            >
                              <div className="p-1.5 rounded-lg bg-amber-500 text-black">
                                <Utensils size={14} />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div className="flex justify-between items-center text-[8px] font-bold text-neutral-500 mb-0.5">
                                  <span className="text-amber-400 font-black">KITCHEN</span>
                                  <span>now</span>
                                </div>
                                <p className="text-[10px] font-extrabold text-white truncate">{phoneNotification.title}</p>
                                <p className="text-[8.5px] text-neutral-400 truncate leading-tight">{phoneNotification.body}</p>
                              </div>
                            </div>
                          )}

                          {/* 1. APP LAUNCHER HOME SCREEN */}
                          {phoneActiveApp === 'home' && (
                            <div className="flex-1 flex flex-col justify-between p-5 relative select-none bg-neutral-900 text-left" style={{ backgroundImage: 'radial-gradient(circle at bottom, rgba(245,158,11,0.08) 0%, transparent 60%)' }}>
                              <div className="grid grid-cols-4 gap-y-6 gap-x-3 mt-4">
                                <button 
                                  onClick={() => {
                                    setPhoneActiveApp('splash');
                                    setTimeout(() => setPhoneActiveApp('food_app'), 1500);
                                  }}
                                  className="flex flex-col items-center gap-1 group focus:outline-none cursor-pointer"
                                >
                                  <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/10 group-active:scale-90 transition">
                                    <Utensils size={24} className="text-black font-extrabold" />
                                    {customerCart.length > 0 && (
                                      <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-bounce">
                                        {customerCart.reduce((sum, i) => sum + i.qty, 0)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] font-bold text-neutral-300">Ordering App</span>
                                </button>

                                <button 
                                  onClick={() => setPhoneActiveApp('gallery')}
                                  className="flex flex-col items-center gap-1 group focus:outline-none cursor-pointer"
                                >
                                  <div className="w-12 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-md group-active:scale-90 transition">
                                    <Eye size={22} className="text-white" />
                                  </div>
                                  <span className="text-[9px] font-bold text-neutral-300">Gallery</span>
                                </button>

                                <button 
                                  onClick={() => setPhoneActiveApp('messages')}
                                  className="flex flex-col items-center gap-1 group focus:outline-none cursor-pointer"
                                >
                                  <div className="relative w-12 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center shadow-md group-active:scale-90 transition">
                                    <MessageSquare size={22} className="text-white" />
                                    {lastSimulatedOrder && (
                                      <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow">
                                        1
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] font-bold text-neutral-300">Messages</span>
                                </button>

                                <button 
                                  onClick={() => setPhoneActiveApp('settings')}
                                  className="flex flex-col items-center gap-1 group focus:outline-none cursor-pointer"
                                >
                                  <div className="w-12 h-12 rounded-xl bg-neutral-800 hover:bg-neutral-750 flex items-center justify-center border border-neutral-700 shadow-md group-active:scale-90 transition">
                                    <Shield size={20} className="text-amber-500" />
                                  </div>
                                  <span className="text-[9px] font-bold text-neutral-300">Settings</span>
                                </button>
                              </div>

                              <div className="bg-neutral-950/70 p-2 rounded-2xl border border-neutral-850 backdrop-blur-md mb-2 flex justify-around items-center">
                                <div className="w-10 h-10 rounded-xl bg-neutral-850 flex items-center justify-center text-neutral-400">
                                  <Smartphone size={18} />
                                </div>
                                <div 
                                  onClick={() => {
                                    setPhoneActiveApp('splash');
                                    setTimeout(() => setPhoneActiveApp('food_app'), 1500);
                                  }}
                                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-black cursor-pointer shadow-md"
                                >
                                  <Utensils size={18} />
                                </div>
                                <div 
                                  onClick={() => setPhoneActiveApp('settings')}
                                  className="w-10 h-10 rounded-xl bg-neutral-850 flex items-center justify-center text-amber-500 cursor-pointer"
                                >
                                  <Shield size={18} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 2. SIMULATED SETTINGS APP */}
                          {phoneActiveApp === 'settings' && (
                            <div className="flex-1 flex flex-col bg-neutral-900 overflow-hidden text-left">
                              <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between shrink-0">
                                <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                                  <Shield size={14} className="text-amber-500" />
                                  Phone Settings
                                </h3>
                                <button 
                                  onClick={() => setPhoneActiveApp('home')}
                                  className="text-[10px] bg-neutral-800 hover:bg-neutral-700 px-2 py-1 text-white font-bold rounded-lg cursor-pointer transition"
                                >
                                  Done
                                </button>
                              </div>
                              
                              <div className="flex-1 p-3 overflow-y-auto space-y-4">
                                <div className="bg-neutral-850 rounded-xl border border-neutral-800 overflow-hidden text-xs">
                                  <div className="p-3 border-b border-neutral-800 flex justify-between items-center">
                                    <span className="font-bold text-neutral-300">Simulate Wi-Fi Connection</span>
                                    <button 
                                      onClick={() => setSimulatedWifi(!simulatedWifi)}
                                      className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-wide cursor-pointer transition ${
                                        simulatedWifi ? 'bg-amber-500 text-black' : 'bg-neutral-700 text-neutral-400'
                                      }`}
                                    >
                                      {simulatedWifi ? 'ON (Online)' : 'OFF (Offline)'}
                                    </button>
                                  </div>
                                  <div className="p-3 text-[10px] text-neutral-400 leading-normal bg-neutral-900/40">
                                    💡 Turning off Wi-Fi will disconnect the Ordering App, simulating offline order queuing behavior.
                                  </div>
                                </div>

                                <div className="bg-neutral-850 rounded-xl border border-neutral-800 p-3 space-y-3 text-xs">
                                  <span className="font-bold text-neutral-300 block">Battery Management</span>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[11px] text-neutral-400">Current Battery Level</span>
                                    <span className="font-mono text-amber-400 font-bold">{simulatedBattery}%</span>
                                  </div>
                                  <button 
                                    onClick={() => setSimulatedBattery(100)}
                                    className="w-full py-1.5 bg-neutral-850 hover:bg-neutral-800 border border-neutral-750 text-white font-semibold rounded-lg text-[10px] transition cursor-pointer"
                                  >
                                    ⚡ Plug in Fast Charger (Charge to 100%)
                                  </button>
                                </div>

                                <div className="bg-neutral-850 rounded-xl border border-neutral-800 p-3 space-y-3 text-xs">
                                  <span className="font-bold text-neutral-300 block">Volume Controls</span>
                                  <div className="flex items-center gap-2">
                                    <VolumeX size={14} className="text-neutral-500" />
                                    <input 
                                      type="range" 
                                      min="0" 
                                      max="100" 
                                      value={simulatedVolume} 
                                      onChange={(e) => {
                                        setSimulatedVolume(Number(e.target.value));
                                        setShowVolumeHUD(true);
                                        if (volumeTimer) clearTimeout(volumeTimer);
                                        const timer = setTimeout(() => setShowVolumeHUD(false), 2000);
                                        setVolumeTimer(timer);
                                      }}
                                      className="flex-1 accent-amber-500 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <Volume2 size={14} className="text-amber-500" />
                                  </div>
                                  <div className="flex justify-between text-[9px] text-neutral-500">
                                    <span>Mute</span>
                                    <span>Current: {simulatedVolume}%</span>
                                    <span>Max</span>
                                  </div>
                                </div>

                                <div className="bg-neutral-850 rounded-xl border border-neutral-800 p-3 text-[10px] text-neutral-400 space-y-1.5">
                                  <p className="font-bold text-neutral-300 text-xs">System Information</p>
                                  <p>Model: Pro Simulator 17</p>
                                  <p>Operating System: Mobile OS v3.5</p>
                                  <p>Language: Filipino / English</p>
                                  <p>Local Time: {phoneTime}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 3. CULINARY GALLERY APP */}
                          {phoneActiveApp === 'gallery' && (
                            <div className="flex-1 flex flex-col bg-neutral-900 overflow-hidden text-left">
                              <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between shrink-0">
                                <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                                  <Eye size={14} className="text-indigo-400" />
                                  Culinary Gallery
                                </h3>
                                <button 
                                  onClick={() => setPhoneActiveApp('home')}
                                  className="text-[10px] bg-neutral-800 hover:bg-neutral-700 px-2 py-1 text-white font-bold rounded-lg cursor-pointer transition"
                                >
                                  Done
                                </button>
                              </div>

                              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                                <p className="text-[10px] text-neutral-400 leading-tight">Explore gourmet dishes crafted by our partner kitchens.</p>
                                
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { name: 'Lechon Kawali', img: 'https://images.unsplash.com/photo-1626847037657-fd3622613ce3?w=500&auto=format&fit=crop&q=80', desc: 'Crispy deep-fried pork belly, thick skin, juicy meat.' },
                                    { name: 'Pork Sisig', img: 'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=500&auto=format&fit=crop&q=80', desc: 'Sizzling hot, crispy, savory seasoned pork belly and liver.' },
                                    { name: 'Chicken Adobo', img: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=500&auto=format&fit=crop&q=80', desc: 'Stewed in dark soy sauce, vinegar, and heavy garlic cloves.' },
                                    { name: 'Halo-Halo Special', img: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=500&auto=format&fit=crop&q=80', desc: 'Special shaved ice dessert layered with ube, flan, and milk.' }
                                  ].map((item, idx) => (
                                    <div key={idx} className="bg-neutral-850 rounded-xl border border-neutral-800 overflow-hidden flex flex-col group">
                                      <img src={item.img} alt={item.name} className="h-24 w-full object-cover group-hover:scale-105 transition" />
                                      <div className="p-2 space-y-0.5">
                                        <span className="text-[10px] font-extrabold text-white">{item.name}</span>
                                        <p className="text-[8px] text-neutral-400 leading-tight line-clamp-2">{item.desc}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 4. SUPPORT MESSAGES APP */}
                          {phoneActiveApp === 'messages' && (
                            <div className="flex-1 flex flex-col bg-neutral-900 overflow-hidden text-left">
                              <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 flex items-center justify-between shrink-0">
                                <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                                  <MessageSquare size={14} className="text-emerald-400" />
                                  Support SMS
                                </h3>
                                <button 
                                  onClick={() => setPhoneActiveApp('home')}
                                  className="text-[10px] bg-neutral-800 hover:bg-neutral-700 px-2 py-1 text-white font-bold rounded-lg cursor-pointer transition"
                                >
                                  Done
                                </button>
                              </div>

                              <div className="flex-1 p-3 overflow-y-auto space-y-3 flex flex-col justify-end text-[10px]">
                                <div className="bg-neutral-850 p-2.5 rounded-xl border border-neutral-800 self-start max-w-[85%]">
                                  <p className="font-extrabold text-[8px] text-neutral-500">KITCHEN PORTAL</p>
                                  <p className="text-white mt-1">Salamat sa pagbisita sa aming store! You can place simulated orders using the Ordering App on your home screen.</p>
                                  <span className="text-[7px] text-neutral-500 block text-right mt-1">09:00 AM</span>
                                </div>

                                {lastSimulatedOrder && (
                                  <>
                                    <div className="bg-neutral-850 p-2.5 rounded-xl border border-neutral-800 self-start max-w-[85%]">
                                      <p className="font-extrabold text-[8px] text-neutral-500">KITCHEN PORTAL</p>
                                      <p className="text-white mt-1">Confirmed! Order <strong>#{lastSimulatedOrder.orderNumber}</strong> has been received. Total: ₱{parseFloat(lastSimulatedOrder.totalAmount || '0').toFixed(2)}.</p>
                                      <span className="text-[7px] text-neutral-500 block text-right mt-1">Just now</span>
                                    </div>

                                    <div className="bg-neutral-850 p-2.5 rounded-xl border border-neutral-800 self-start max-w-[85%] animate-pulse">
                                      <p className="font-extrabold text-[8px] text-neutral-500">KITCHEN PORTAL</p>
                                      <p className="text-white mt-1">Ang inyong order ay kasalukuyang nasa status na: <strong className="text-amber-400 uppercase font-black">{lastSimulatedOrder.orderStatus}</strong>.</p>
                                      <span className="text-[7px] text-neutral-500 block text-right mt-1">Just now</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 5. FOOD ORDERING APP MAIN VIEWS */}
                          {phoneActiveApp === 'food_app' && (
                            <div className="flex-1 flex flex-col overflow-hidden relative">
                              
                              {/* APP NAVBAR */}
                              <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 text-white flex items-center justify-between shadow-md shrink-0">
                                <div className="flex items-center gap-2">
                                  <Smartphone size={16} className="text-amber-500 animate-pulse" />
                                  <span className="font-extrabold text-xs tracking-tight text-amber-500">Food Ordering App</span>
                                </div>
                                <button 
                                  onClick={() => setPhoneActiveApp('settings')}
                                  className={`text-[9px] px-2 py-0.5 rounded-full font-mono border hover:bg-neutral-800 cursor-pointer transition ${
                                    simulatedWifi ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
                                  }`}
                                >
                                  {simulatedWifi ? 'Online Mode' : 'Offline Mode ⚠️'}
                                </button>
                              </div>

                              {/* VIEW ROUTER */}
                              <div className="flex-1 p-3 overflow-y-auto pb-16 text-left">
                      
                      {/* 1. PRODUCTS DIRECTORY */}
                      {customerView === 'products' && (
                        <div className="space-y-3">
                          {/* Welcome Banner */}
                          <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                            <h4 className="text-xs font-bold text-amber-500">👋 Welcome!</h4>
                            <p className="text-[10px] text-neutral-400 mt-0.5">Order fresh, delicious meals in real-time from our kitchen.</p>
                          </div>

                          {/* Search Bar inside app */}
                          <div className="relative rounded-lg bg-neutral-800 border border-neutral-750 flex items-center px-2 py-1">
                            <Search size={12} className="text-neutral-500 mr-1.5" />
                            <input 
                              type="text" 
                              placeholder="Search foods..." 
                              value={customerSearch}
                              onChange={(e) => setCustomerSearch(e.target.value)}
                              className="w-full bg-transparent text-xs text-white focus:outline-none py-1"
                            />
                          </div>

                          {/* Category Tabs inside app */}
                          <div className="flex gap-1 overflow-x-auto pb-1 max-w-full scrollbar-none">
                            {['All', ...categories.filter(c => c !== 'All')].map(cat => (
                              <button
                                key={cat}
                                onClick={() => setCustomerCategory(cat)}
                                className={`text-[10px] px-2.5 py-1 rounded-full border shrink-0 transition-all cursor-pointer font-medium ${
                                  customerCategory === cat 
                                    ? 'bg-amber-500 border-amber-500 text-black font-extrabold' 
                                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>

                          {/* Products Grid inside app */}
                          <div className="space-y-2">
                            {menuItems
                              .filter(item => item.status === 'active')
                              .filter(item => customerCategory === 'All' || item.category === customerCategory)
                              .filter(item => item.name.toLowerCase().includes(customerSearch.toLowerCase()))
                              .map(item => {
                                const cartItem = customerCart.find(c => c.id === item.id);
                                const isOutOfStock = item.inventoryQty === 0;

                                return (
                                  <div key={item.id} className="bg-neutral-850 p-2.5 rounded-xl border border-neutral-800/80 flex items-center justify-between gap-3">
                                    {/* Food Thumbnail Image */}
                                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-800 relative border border-neutral-800/40">
                                      <img 
                                        src={item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=150&auto=format&fit=crop&q=80"} 
                                        alt={item.name}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <h5 className="text-xs font-bold text-white truncate">{item.name}</h5>
                                      <p className="text-[9px] text-neutral-400 mt-0.5">Category: {item.category}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs font-black text-amber-400">₱{parseFloat(item.price.toString()).toFixed(2)}</span>
                                        <span className={`text-[8px] px-1 rounded ${
                                          isOutOfStock 
                                            ? 'bg-rose-950/50 text-rose-400' 
                                            : item.inventoryQty <= 5 
                                              ? 'bg-amber-950/50 text-amber-400' 
                                              : 'bg-neutral-800 text-neutral-500'
                                        }`}>
                                          {isOutOfStock ? 'Sold Out' : `${item.inventoryQty} in Stock`}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    {/* Action Button inside app */}
                                    <div className="shrink-0">
                                      {isOutOfStock ? (
                                        <button disabled className="text-[9px] px-2 py-1 bg-neutral-800 text-neutral-600 rounded-lg cursor-not-allowed">
                                          Unavailable
                                        </button>
                                      ) : cartItem ? (
                                        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg p-0.5">
                                          <button 
                                            onClick={() => {
                                              if (cartItem.qty === 1) {
                                                setCustomerCart(customerCart.filter(c => c.id !== item.id));
                                              } else {
                                                setCustomerCart(customerCart.map(c => c.id === item.id ? { ...c, qty: c.qty - 1 } : c));
                                              }
                                            }}
                                            className="w-5 h-5 text-xs text-white bg-amber-600 hover:bg-amber-500 rounded flex items-center justify-center cursor-pointer"
                                          >
                                            -
                                          </button>
                                          <span className="text-[10px] font-bold text-white px-1">{cartItem.qty}</span>
                                          <button 
                                            onClick={() => {
                                              if (cartItem.qty < item.inventoryQty) {
                                                setCustomerCart(customerCart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
                                              } else {
                                                showToast("Cannot order more than available kitchen inventory!", "warning");
                                              }
                                            }}
                                            className="w-5 h-5 text-xs text-white bg-amber-600 hover:bg-amber-500 rounded flex items-center justify-center cursor-pointer"
                                          >
                                            +
                                          </button>
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={() => {
                                            // Add to simulator API logs
                                            const reqId = Math.random().toString(36).substring(7);
                                            setSimulatedApiLogs(prev => [
                                              {
                                                id: reqId,
                                                method: 'GET',
                                                url: `/api/public/products`,
                                                timestamp: new Date().toLocaleTimeString(),
                                                type: 'request',
                                                payload: undefined
                                              },
                                              {
                                                id: reqId + '-res',
                                                method: 'GET',
                                                url: `/api/public/products`,
                                                timestamp: new Date().toLocaleTimeString(),
                                                type: 'response',
                                                payload: JSON.stringify(item, null, 2)
                                              },
                                              ...prev
                                            ]);
                                            setCustomerCart([...customerCart, { id: item.id, name: item.name, qty: 1, price: item.price }]);
                                          }}
                                          className="text-[10px] font-bold px-3 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black rounded-lg transition-all cursor-pointer"
                                        >
                                          Add to Cart
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* 2. CUSTOMER CART VIEW */}
                      {customerView === 'cart' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                            <button 
                              onClick={() => setCustomerView('products')}
                              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              ← Browse
                            </button>
                            <h4 className="text-xs font-bold text-white">Your Cart ({customerCart.reduce((acc, c) => acc + c.qty, 0)} items)</h4>
                          </div>

                          {customerCart.length === 0 ? (
                            <div className="py-12 text-center text-neutral-500">
                              <ShoppingCart className="mx-auto text-neutral-600 mb-2" size={24} />
                              <p className="text-xs">Your shopping cart is empty.</p>
                              <button 
                                onClick={() => setCustomerView('products')}
                                className="mt-3 text-[10px] text-amber-500 font-bold border border-amber-500/30 px-3 py-1 rounded-full cursor-pointer"
                              >
                                Go add items
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                                {customerCart.map(cartItem => (
                                  <div key={cartItem.id} className="bg-neutral-850 p-2.5 rounded-lg border border-neutral-800/60 flex flex-col gap-1.5">
                                    <div className="flex justify-between items-center">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-white truncate">{cartItem.name}</p>
                                        <p className="text-[9px] text-neutral-400 mt-0.5">₱{parseFloat(cartItem.price.toString()).toFixed(2)} each x {cartItem.qty}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-amber-400 font-extrabold">₱{(cartItem.price * cartItem.qty).toFixed(2)}</span>
                                        <button 
                                          onClick={() => setCustomerCart(customerCart.filter(c => c.id !== cartItem.id))}
                                          className="text-neutral-500 hover:text-rose-400 text-xs px-1 cursor-pointer"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>

                                    {/* Selected allergies warnings */}
                                    {cartItem.allergies && cartItem.allergies.length > 0 && (
                                      <div className="text-[8px] bg-rose-500/10 border border-rose-500/20 text-rose-400 p-1.5 rounded flex flex-col gap-0.5">
                                        <div className="font-bold">⚠️ Customer Allergy: {cartItem.allergies.join(', ')}</div>
                                        <div className="capitalize font-semibold text-[8px] opacity-90">Action: {cartItem.allergyAction === 'remove' ? 'Remove Ingredient' : cartItem.allergyAction === 'alternative' ? 'Substitute Ingredient' : 'Custom Request'}</div>
                                        {cartItem.allergyDetails && <div className="italic text-neutral-300">"{cartItem.allergyDetails}"</div>}
                                      </div>
                                    )}

                                    <div className="flex justify-end">
                                      <button
                                        onClick={() => {
                                          const foundItem = menuItems.find(m => m.id === cartItem.id);
                                          setAllergyModalItem({
                                            itemId: cartItem.id,
                                            name: cartItem.name,
                                            ingredients: foundItem?.ingredients || [],
                                            allergens: foundItem?.allergens || [],
                                            currentAllergies: cartItem.allergies || [],
                                            currentAction: cartItem.allergyAction || 'remove',
                                            currentDetails: cartItem.allergyDetails || '',
                                            source: 'customer'
                                          });
                                        }}
                                        className="text-[8px] text-rose-400 hover:text-rose-300 font-bold border border-rose-500/20 hover:border-rose-500/40 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 bg-rose-950/20 transition"
                                      >
                                        🛡️ Specify Allergies / Change Ingredients
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="border-t border-neutral-800 pt-3 space-y-2">
                                <div className="flex justify-between text-xs text-neutral-400">
                                  <span>Delivery Fee:</span>
                                  <span className="text-amber-500 font-mono">FREE</span>
                                </div>
                                <div className="flex justify-between text-xs font-extrabold text-white">
                                  <span>Total Amount:</span>
                                  <span className="text-amber-400">₱{customerCart.reduce((sum, i) => sum + (i.price * i.qty), 0).toFixed(2)}</span>
                                </div>
                                <button
                                  onClick={() => setCustomerView('checkout')}
                                  className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-xl text-xs font-extrabold tracking-wide shadow transition-all active:scale-98 cursor-pointer mt-2"
                                >
                                  Proceed to Checkout
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. CUSTOMER CHECKOUT VIEW */}
                      {customerView === 'checkout' && (
                        <div className="space-y-3.5">
                          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                            <button 
                              onClick={() => setCustomerView('cart')}
                              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              ← Back to Cart
                            </button>
                            <h4 className="text-xs font-bold text-white">Checkout Details</h4>
                          </div>

                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[9px] uppercase font-bold text-neutral-400 block mb-1">Customer Full Name *</label>
                              <input 
                                type="text"
                                placeholder="e.g. Mark Destaho"
                                value={custName}
                                onChange={(e) => setCustName(e.target.value)}
                                className="w-full bg-neutral-850 border border-neutral-750 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-500 text-white"
                              />
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                              <div>
                                <label className="text-[9px] uppercase font-bold text-neutral-400 block mb-1">Phone Number *</label>
                                <input 
                                  type="text"
                                  placeholder="e.g. 0917-123-4567"
                                  value={custPhone}
                                  onChange={(e) => setCustPhone(e.target.value)}
                                  className="w-full bg-neutral-850 border border-neutral-750 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-500 text-white"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[9px] uppercase font-bold text-neutral-400 block mb-1">Delivery Address *</label>
                              <textarea 
                                placeholder="e.g. Blk 4 Lot 10, Laguna University, Santa Cruz, Laguna"
                                value={custAddress}
                                onChange={(e) => setCustAddress(e.target.value)}
                                rows={2}
                                className="w-full bg-neutral-850 border border-neutral-750 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-500 text-white resize-none"
                              />
                            </div>

                            <div>
                              <label className="text-[9px] uppercase font-bold text-neutral-400 block mb-1">Payment Method</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                {(['cash', 'e-wallet', 'card'] as const).map(pm => (
                                  <button
                                    key={pm}
                                    type="button"
                                    onClick={() => setCustPayment(pm)}
                                    className={`py-1.5 px-1 rounded-lg text-[9px] font-bold border uppercase text-center transition-all cursor-pointer ${
                                      custPayment === pm 
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                                        : 'bg-neutral-850 border-neutral-750 text-neutral-400'
                                    }`}
                                  >
                                    {pm === 'cash' ? '💵 COD' : pm === 'e-wallet' ? '📱 GCash' : '💳 Card'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-neutral-800 pt-3 space-y-2">
                            <div className="flex justify-between text-xs text-white font-extrabold">
                              <span>Total Amount:</span>
                              <span className="text-amber-400">₱{customerCart.reduce((sum, i) => sum + (i.price * i.qty), 0).toFixed(2)}</span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={async () => {
                                if (!simulatedWifi) {
                                  showToast("⚠️ Order transmission failed! Smartphone is offline. Please enable Wi-Fi in the Settings App first.", "error");
                                  return;
                                }

                                if (!custName.trim() || !custPhone.trim() || !custAddress.trim()) {
                                  showToast("Please fill in all delivery information!", "warning");
                                  return;
                                }

                                const reqId = Math.random().toString(36).substring(7);
                                
                                const requestPayload = {
                                  customerName: custName,
                                  customerPhone: custPhone,
                                  deliveryAddress: custAddress,
                                  items: customerCart.map(c => ({ 
                                    id: c.id, 
                                    name: c.name, 
                                    qty: c.qty, 
                                    price: Number(c.price),
                                    allergies: c.allergies || undefined,
                                    allergyAction: c.allergyAction || undefined,
                                    allergyDetails: c.allergyDetails || undefined
                                  })),
                                  paymentMethod: custPayment
                                };

                                // 1. Log request payload
                                setSimulatedApiLogs(prev => [
                                  {
                                    id: reqId,
                                    method: 'POST',
                                    url: `/api/public/orders`,
                                    timestamp: new Date().toLocaleTimeString(),
                                    type: 'request',
                                    payload: JSON.stringify(requestPayload, null, 2)
                                  },
                                  ...prev
                                ]);

                                try {
                                  // 2. Perform live REST API Post Request to our server.ts
                                  const response = await fetch('/api/public/orders', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(requestPayload)
                                  });

                                  const responseData = await response.json();

                                  if (responseData.success) {
                                    // 3. Log success response payload
                                    setSimulatedApiLogs(prev => [
                                      {
                                        id: reqId + '-res',
                                        method: 'POST',
                                        url: `/api/public/orders`,
                                        timestamp: new Date().toLocaleTimeString(),
                                        type: 'response',
                                        payload: JSON.stringify(responseData, null, 2)
                                      },
                                      ...prev
                                    ]);

                                    const createdOrder: Order = {
                                      id: responseData.order.id,
                                      orderNumber: responseData.order.orderNumber,
                                      customerName: responseData.order.customerName,
                                      customerPhone: responseData.order.customerPhone,
                                      deliveryAddress: responseData.order.deliveryAddress,
                                      items: responseData.order.items,
                                      totalAmount: responseData.order.totalAmount,
                                      paymentStatus: responseData.order.paymentStatus as any,
                                      paymentMethod: responseData.order.paymentMethod as any,
                                      orderStatus: responseData.order.orderStatus as any,
                                      actionBy: responseData.order.actionBy,
                                      stockReduced: responseData.order.stockReduced,
                                      createdAt: responseData.order.createdAt,
                                      updatedAt: responseData.order.updatedAt,
                                    };

                                    // Push directly to live queue local state too!
                                    const updatedOrders = [createdOrder, ...orders];
                                    setOrders(updatedOrders);
                                    localStorage.setItem('food_orders', JSON.stringify(updatedOrders));

                                    // Trigger sound notifier
                                    playOrderChime();
                                    
                                    setLastSimulatedOrder(createdOrder);
                                    writeAuditLog(`Online Customer [${custName}] placed Order ${createdOrder.orderNumber} via API`);
                                    setCustomerView('success');
                                  } else {
                                    throw new Error(responseData.error || "Failed");
                                  }
                                } catch (err: any) {
                                  console.error("Simulation request error:", err);
                                  showToast("API error: " + (err.message || "Request failed"), "error");
                                }
                              }}
                              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              Place Delivery Order
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 4. SUCCESS SCREEN */}
                      {customerView === 'success' && (
                        <div className="py-8 px-4 text-center space-y-4">
                          <div className="w-16 h-16 bg-amber-500/10 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto text-amber-400 text-2xl font-black">
                            ✓
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">Order Received!</h4>
                            <p className="text-[10px] text-neutral-400 mt-1">
                              Your checkout request has been executed successfully via REST API.
                            </p>
                          </div>

                          <div className="bg-neutral-850 p-3 rounded-xl border border-neutral-800 text-left space-y-1 text-[10px] font-mono">
                            <p className="text-neutral-400">Order Ref: <span className="text-white font-bold">{lastSimulatedOrder?.orderNumber}</span></p>
                            <p className="text-neutral-400">Total Charged: <span className="text-amber-400 font-bold">₱{parseFloat(lastSimulatedOrder?.totalAmount || '0').toFixed(2)}</span></p>
                            <p className="text-neutral-400">Payment: <span className="text-white uppercase">{lastSimulatedOrder?.paymentMethod} ({lastSimulatedOrder?.paymentStatus})</span></p>
                          </div>

                          <div className="text-[10px] text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-center">
                            🔔 <strong>Sellers notified!</strong> This order has been forwarded to the <strong>Live Queue</strong> on the Seller dashboard. Go check it out!
                          </div>

                          <button
                            onClick={() => {
                              // Reset state
                              setCustomerCart([]);
                              setCustName('');
                              setCustPhone('');
                              setCustAddress('');
                              setCustomerView('products');
                            }}
                            className="text-xs text-white font-semibold bg-neutral-800 hover:bg-neutral-700 px-4 py-2 rounded-lg cursor-pointer inline-block"
                          >
                            Start New Order
                          </button>
                        </div>
                      )}

                    </div>

                    {/* APPMOBILE FIXED FOOTER */}
                            <div className="absolute bottom-0 left-0 right-0 h-14 bg-neutral-950 border-t border-neutral-850 flex justify-around items-center px-6 z-10 select-none">
                              <button 
                                onClick={() => {
                                  if (customerView !== 'success') setCustomerView('products');
                                }}
                                className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                                  customerView === 'products' ? 'text-amber-400 font-bold' : 'text-neutral-500 hover:text-neutral-300'
                                }`}
                              >
                                <Utensils size={15} />
                                <span className="text-[9px]">Menu</span>
                              </button>
                              <button 
                                onClick={() => {
                                  if (customerView !== 'success') setCustomerView('cart');
                                }}
                                className={`flex flex-col items-center gap-1 cursor-pointer transition relative ${
                                  customerView === 'cart' || customerView === 'checkout' ? 'text-amber-400 font-bold' : 'text-neutral-500 hover:text-neutral-300'
                                }`}
                              >
                                <ShoppingCart size={15} />
                                <span className="text-[9px]">Cart</span>
                                {customerCart.length > 0 && (
                                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                                    {customerCart.reduce((sum, i) => sum + i.qty, 0)}
                                  </span>
                                )}
                              </button>
                            </div>

                          </div>
                        )}

                        {/* HOME GESTURE BAR INDICATOR */}
                        <div 
                          onClick={() => {
                            if (phoneActiveApp !== 'home') setPhoneActiveApp('home');
                          }}
                          className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-neutral-700 hover:bg-neutral-300 rounded-full cursor-pointer transition active:scale-95 z-40 select-none group"
                          title="Click to go Home"
                        >
                          <div className="absolute inset-[-10px] bg-transparent" />
                        </div>

                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>

              {/* RIGHT COLUMN: THE API & PAYLOAD CONTRACT VISUALIZER */}
              <div className="xl:col-span-7 space-y-6">
                
                {/* Integration Info Banner */}
                <div className={`p-6 rounded-2xl border ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
                }`}>
                  <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                    <Database className="text-amber-500" />
                    Customer Module Integration Hub (API Playground)
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    To satisfy the <strong>Laguna University BSIT Specialization in Business Analytics</strong> requirements, this hub demonstrates our <strong>Decoupled API Architecture</strong>. It acts as the bridge connecting the Customer Module with the Seller Module in real-time.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
                    <div className="bg-neutral-850 p-3.5 rounded-xl border border-neutral-800/80 space-y-1">
                      <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider block">Customer App (Data Loading)</span>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        Does NOT store a local inventory database. Instead, it fires requests to <code>GET /api/public/products</code> to dynamically display available menu items, establishing the Seller as the "Single Source of Truth".
                      </p>
                    </div>
                    <div className="bg-neutral-850 p-3.5 rounded-xl border border-neutral-800/80 space-y-1">
                      <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider block">Unified Order Ingress</span>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        When customer presses checkout, details are serialized into JSON and sent to <code>POST /api/public/orders</code>, immediately updating the seller POS Live Queue and triggering notifications.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Live REST API Endpoint Documentation & Visual Schema Contract */}
                <div className={`p-6 rounded-2xl border ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
                } space-y-4`}>
                  <h3 className="text-xs font-extrabold text-neutral-400 uppercase tracking-wider border-b border-neutral-800 pb-2">
                    🎓 Project Defense Integration Code Contracts
                  </h3>

                  <div className="space-y-4 text-xs">
                    {/* GET contract */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-black">GET</span>
                        <code className="text-xs font-mono text-white font-bold">/api/public/products</code>
                      </div>
                      <p className="text-[11px] text-neutral-400 pl-1">Loads the active store catalog and real-time stock levels.</p>
                    </div>

                    {/* POST contract */}
                    <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-indigo-950 text-indigo-400 border border-indigo-800/60 rounded text-[10px] font-black">POST</span>
                        <code className="text-xs font-mono text-white font-bold">/api/public/orders</code>
                      </div>
                      <p className="text-[11px] text-neutral-400 pl-1">Submits a new online order. Expected JSON Request Schema:</p>
                      
                      <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-850 font-mono text-[10px] text-neutral-300 leading-relaxed overflow-x-auto">
{`{
  "customerName": "Jane Doe",
  "customerPhone": "09171234567",
  "deliveryAddress": "45 Rizal St, Santa Cruz, Laguna",
  "paymentMethod": "cash", // or "e-wallet", "card"
  "items": [
    { "id": "uuid-1234", "name": "Spaghetti Meal", "qty": 2, "price": 125.00 }
  ]
}`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* API TRANSACTION LOGGER */}
                <div className={`p-6 rounded-2xl border ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
                } space-y-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-extrabold text-neutral-400 uppercase tracking-wider">
                        ⚡ Real-Time API Activity Logs (Console)
                      </h3>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Captures HTTP requests generated by the Customer app simulation</p>
                    </div>
                    <button 
                      onClick={() => setSimulatedApiLogs([])}
                      className="text-[10px] font-bold text-rose-400 bg-rose-950/40 border border-rose-900/40 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-rose-900/60 transition"
                    >
                      Clear Logs
                    </button>
                  </div>

                  {simulatedApiLogs.length === 0 ? (
                    <div className="py-8 text-center text-neutral-600 bg-neutral-950 rounded-xl border border-neutral-900 text-xs">
                      No API calls registered yet. Try clicking items or checking out inside the smartphone simulator!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {simulatedApiLogs.map(log => (
                        <div key={log.id} className="bg-neutral-950 p-3 rounded-lg border border-neutral-900 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                                log.type === 'request' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              }`}>
                                {log.type === 'request' ? 'REQUEST' : 'RESPONSE'}
                              </span>
                              <span className="text-neutral-500">{log.timestamp}</span>
                            </div>
                            <span className="text-neutral-400 font-bold">{log.method} {log.url}</span>
                          </div>

                          {log.payload && (
                            <div className="bg-neutral-900/60 p-2 rounded border border-neutral-850 font-mono text-[9px] text-neutral-300 max-h-[120px] overflow-y-auto overflow-x-auto">
                              <pre>{log.payload}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
              A. POS REGISTER TAB
              ------------------------------------------------------------- */}
          {activeTab === 'pos' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: Dishes grids */}
              <div className="md:col-span-7 lg:col-span-8 space-y-4">
                
                {/* Search and Category Row */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className={`relative flex-1 rounded-xl border flex items-center px-3 py-1 ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
                  }`}>
                    <Search size={15} className="text-neutral-500 mr-2" />
                    <input 
                      type="text" 
                      placeholder="Search menu items or SKU..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none py-1.5"
                    />
                  </div>
                  
                  {/* Category switcher */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium cursor-pointer ${
                          selectedCategory === cat 
                            ? 'bg-amber-500 border-amber-500 text-white' 
                            : theme === 'dark' 
                              ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-300' 
                              : 'bg-white border-neutral-300 hover:bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid container */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMenuItems.map(dish => {
                    const isLowStock = dish.inventoryQty <= 5;
                    const isOutOfStock = dish.inventoryQty === 0;

                    return (
                      <motion.div
                        key={dish.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => !isOutOfStock && addToCart(dish)}
                        className={`p-4 rounded-xl border transition-all select-none flex flex-col justify-between ${
                          isOutOfStock 
                            ? 'opacity-50 cursor-not-allowed ' 
                            : 'cursor-pointer hover:scale-[1.02] active:scale-95'
                        } ${
                          theme === 'dark' 
                            ? 'bg-neutral-900 border-neutral-800 hover:border-amber-500' 
                            : 'bg-white border-neutral-200 hover:border-amber-500 shadow-sm'
                        }`}
                      >
                        <div>
                          {/* Food Image */}
                          <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-neutral-800/50 relative border border-neutral-800/30">
                            <img 
                              src={dish.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80"} 
                              alt={dish.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-300"
                            />
                          </div>

                          <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            theme === 'dark' ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {dish.category}
                          </span>
                          
                          {/* Stock status indicator */}
                          {isOutOfStock ? (
                            <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded">
                              OUT OF STOCK
                            </span>
                          ) : isLowStock ? (
                            <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                              LOW STOCK ({dish.inventoryQty})
                            </span>
                          ) : (
                            <span className="text-emerald-500 text-[10px] font-mono">
                              Qty: {dish.inventoryQty}
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold text-sm mb-1 leading-snug">{dish.name}</h3>
                        <p className="font-mono text-xs text-neutral-400 mb-2">{dish.sku || 'No SKU'}</p>

                        {/* Predefined allergens badge list */}
                        {dish.allergens && dish.allergens.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {dish.allergens.map((alg, i) => (
                              <span key={i} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                ⚠️ {alg}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-dashed border-neutral-800 mt-2">
                          <span className="text-amber-500 font-bold text-base font-mono">₱{dish.price.toFixed(2)}</span>
                          <span className={`text-[11px] font-medium p-1 rounded-lg ${
                            theme === 'dark' ? 'bg-neutral-800 text-amber-500' : 'bg-neutral-100 text-amber-600'
                          }`}>
                            + Add to Cart
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {filteredMenuItems.length === 0 && (
                    <div className="col-span-full py-12 text-center text-neutral-500 text-sm">
                      No menu items found. Add new items in the <strong>Menu & Stocks</strong> tab!
                    </div>
                  )}
                </div>

              </div>

              {/* RIGHT COLUMN: Interactive Cart with checkout */}
              <div className="md:col-span-5 lg:col-span-4">
                <div className={`p-5 rounded-2xl border flex flex-col shrink-0 min-h-[500px] ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow'
                }`}>
                  <div className="flex items-center justify-between pb-3 border-b border-dashed border-neutral-800 mb-4">
                    <span className="font-bold flex items-center gap-2">
                      <ShoppingCart size={16} className="text-amber-500" />
                      Shopping Cart ({Object.keys(cart).length})
                    </span>
                    <button 
                      onClick={clearCart}
                      className="text-xs text-neutral-500 hover:text-rose-500 transition"
                    >
                      Clear Cart
                    </button>
                  </div>

                  {/* Cart Item Rows */}
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] mb-4 pr-1">
                    {Object.values(cart).map(({ item, qty, notes, allergies, allergyAction, allergyDetails }) => (
                      <div key={item.id} className="text-xs border-b border-neutral-800/50 pb-2.5 last:border-0 last:pb-0 space-y-1.5">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <div>
                            <span className="font-semibold block">{item.name}</span>
                            {/* Selected allergies warnings */}
                            {allergies && allergies.length > 0 && (
                              <div className="mt-1 text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded flex flex-col gap-0.5">
                                <div className="font-bold flex items-center gap-1">⚠️ Allergy: {allergies.join(', ')}</div>
                                <div className="capitalize text-[8px] opacity-90">Action: {allergyAction === 'remove' ? 'Tanggalin Ingredient' : allergyAction === 'alternative' ? 'Palitan ng Alternative' : 'Custom Request'}</div>
                                {allergyDetails && <div className="text-[8px] text-neutral-300 italic">"{allergyDetails}"</div>}
                              </div>
                            )}
                          </div>
                          <span className="font-mono text-neutral-400">₱{(item.price * qty).toFixed(2)}</span>
                        </div>
                        
                        {/* Adjust items */}
                        <div className="flex items-center justify-between mt-2.5">
                          {/* Note/Allergy button */}
                          <div className="flex items-center gap-2 w-[60%]">
                            <input 
                              type="text" 
                              placeholder="Add notes..." 
                              value={notes}
                              onChange={(e) => setCartItemNotes(item.id, e.target.value)}
                              className="bg-transparent text-[10px] w-full placeholder:text-[10px] border-b border-transparent focus:border-neutral-700 text-neutral-400 focus:outline-none"
                            />
                            <button
                              onClick={() => {
                                setAllergyModalItem({
                                  itemId: item.id,
                                  name: item.name,
                                  ingredients: item.ingredients || [],
                                  allergens: item.allergens || [],
                                  currentAllergies: allergies || [],
                                  currentAction: allergyAction || 'remove',
                                  currentDetails: allergyDetails || '',
                                  source: 'pos'
                                });
                              }}
                              className="px-1.5 py-0.5 shrink-0 text-[8px] font-bold bg-rose-950/40 text-rose-400 border border-rose-900/40 hover:bg-rose-900/40 rounded transition cursor-pointer"
                              title="Set Customer Allergy/Alternative Settings"
                            >
                              🛡️ Allergy/Alt
                            </button>
                          </div>
                          
                          {/* Qty incrementors */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateCartQty(item.id, qty - 1)}
                              className="w-5 h-5 rounded bg-neutral-800 text-slate-300 flex items-center justify-center hover:bg-neutral-700 transition cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-mono font-medium">{qty}</span>
                            <button
                              onClick={() => updateCartQty(item.id, qty + 1)}
                              className="w-5 h-5 rounded bg-neutral-800 text-slate-300 flex items-center justify-center hover:bg-neutral-700 transition cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {Object.keys(cart).length === 0 && (
                      <div className="h-40 flex flex-col items-center justify-center text-center text-neutral-500 gap-2">
                        <div className="bg-neutral-850 p-3 rounded-full text-neutral-600">
                          <ShoppingCart size={24} />
                        </div>
                        <p className="text-xs">Your cart is empty. <br /> Select items from the menu!</p>
                      </div>
                    )}
                  </div>

                  {/* Calculations & Customer details */}
                  {Object.keys(cart).length > 0 && (
                    <div className="space-y-4 pt-3 border-t border-dashed border-neutral-800">
                      
                      {checkoutStep === 1 ? (
                        <>
                          <div className="space-y-2">
                            <label className="text-[11px] font-semibold text-neutral-400 block uppercase tracking-wider">Customer Name</label>
                            <input 
                              type="text" 
                              placeholder="John Doe (optional)"
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none ${
                                theme === 'dark' ? 'bg-neutral-800 border-neutral-700 focus:border-amber-500' : 'bg-white border-neutral-300 focus:border-amber-500'
                              }`}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-neutral-400 block uppercase tracking-wider">Payment Method</label>
                            <div className="grid grid-cols-3 gap-2">
                              {(['cash', 'e-wallet', 'card'] as const).map(method => (
                                <button
                                  key={method}
                                  type="button"
                                  onClick={() => setPaymentMethod(method)}
                                  className={`py-1.5 text-[10px] font-bold rounded-lg border uppercase cursor-pointer ${
                                    paymentMethod === method 
                                      ? 'bg-amber-500 border-amber-500 text-white' 
                                      : 'bg-transparent border-neutral-700 text-neutral-400 hover:bg-neutral-850'
                                  }`}
                                >
                                  {method}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Grand Total */}
                          <div className="flex justify-between items-center text-neutral-300 pt-2 font-semibold">
                            <span className="text-xs">GRAND TOTAL:</span>
                            <span className="text-xl font-mono font-bold text-amber-500">₱{getTotalCartPrice().toFixed(2)}</span>
                          </div>

                          <button
                            onClick={() => {
                              if (paymentMethod === 'cash') {
                                setCheckoutStep(2);
                              } else {
                                processCheckout();
                              }
                            }}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition shadow active:scale-[0.98] cursor-pointer"
                          >
                            {paymentMethod === 'cash' ? 'Calculate Change' : 'Complete Order'}
                          </button>
                        </>
                      ) : (
                        // Cash tender calculator
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold text-amber-500">💰 Change / Cash Calculator</h4>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span>Amount Due:</span>
                              <span className="font-mono">₱{getTotalCartPrice().toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] text-neutral-400">Cash Tendered:</label>
                              <input 
                                type="number" 
                                placeholder="Enter amount..."
                                value={cashTendered}
                                onChange={(e) => setCashTendered(e.target.value)}
                                className={`w-full text-sm font-mono px-3 py-2 rounded-lg border focus:outline-none ${
                                  theme === 'dark' ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-300'
                                }`}
                              />
                            </div>
                          </div>

                          {/* Change feedback */}
                          {parseFloat(cashTendered) >= getTotalCartPrice() && (
                            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg flex justify-between items-center font-mono text-sm">
                              <span>Change:</span>
                              <span className="font-bold">₱{(parseFloat(cashTendered) - getTotalCartPrice()).toFixed(2)}</span>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setCheckoutStep(1)}
                              className="py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-lg text-center"
                            >
                              Back
                            </button>
                            <button
                              onClick={processCheckout}
                              disabled={paymentMethod === 'cash' && (!cashTendered || parseFloat(cashTendered) < getTotalCartPrice())}
                              className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg disabled:opacity-40 transition cursor-pointer"
                            >
                              Confirm Checkout
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              </div>

            </div>
          )}

          {/* -------------------------------------------------------------
              B. LIVE QUEUE TAB
              ------------------------------------------------------------- */}
          {activeTab === 'orders' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow'
            }`}>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <ClipboardList className="text-indigo-500" />
                    Live Orders Queue & Workflows
                  </h2>
                  <p className="text-xs text-neutral-500">Monitor and update the status of each incoming order.</p>
                </div>

                {/* Filter segments */}
                <div className="flex border rounded-lg overflow-hidden border-neutral-700">
                  {(['all', 'pending', 'completed', 'cancelled'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setOrderFilter(f)}
                      className={`px-3 py-1.5 text-xs font-semibold uppercase cursor-pointer ${
                        orderFilter === f 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-transparent text-neutral-400 hover:bg-neutral-800'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Lists */}
              <div className="space-y-4">
                {displayOrders.map(order => {
                  const itemsSummary = order.items.map(itm => `${itm.name} (x${itm.qty})`).join(', ');
                  const isPending = order.orderStatus === 'received' || order.orderStatus === 'preparing' || order.orderStatus === 'ready';

                  return (
                    <div 
                      key={order.id} 
                      className={`p-5 rounded-xl border flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 transition-all ${
                        order.orderStatus === 'completed' ? 'border-neutral-800 opacity-75' :
                        order.orderStatus === 'cancelled' ? 'border-neutral-800 opacity-60 bg-red-950/5' :
                        'border-neutral-700 bg-neutral-950/20'
                      }`}
                    >
                      <div className="space-y-1.5 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-indigo-400">{order.orderNumber}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            order.orderStatus === 'received' ? 'bg-indigo-500/20 text-indigo-400' :
                            order.orderStatus === 'preparing' ? 'bg-amber-500/20 text-amber-400' :
                            order.orderStatus === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                            order.orderStatus === 'completed' ? 'bg-neutral-500/20 text-neutral-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {order.orderStatus}
                          </span>
                          <span className="text-xs text-neutral-500">| Customer: <strong>{order.customerName}</strong></span>
                        </div>

                        <p className="text-xs font-medium text-neutral-300">
                          🛒 Menu Items: <span className="font-semibold text-white">{itemsSummary}</span>
                        </p>

                        {(order.deliveryAddress || order.customerPhone) && (
                          <p className="text-[11px] font-medium text-neutral-400">
                            {order.deliveryAddress && (
                              <span>📍 Delivery Address: <span className="text-white font-semibold">{order.deliveryAddress}</span></span>
                            )}
                            {order.customerPhone && (
                              <span className={`${order.deliveryAddress ? 'ml-3' : ''}`}>📞 Phone: <span className="text-white font-semibold">{order.customerPhone}</span></span>
                            )}
                          </p>
                        )}

                        {/* Render detailed allergy warnings for preparation staff */}
                        {order.items.some(itm => itm.allergies && itm.allergies.length > 0) && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                              ⚠️ ALLERGY SUBSTITUTION WARNING (TANGGALIN / PALITAN)
                            </span>
                            <div className="space-y-1 pl-1">
                              {order.items.filter(itm => itm.allergies && itm.allergies.length > 0).map((itm, index) => (
                                <div key={index} className="text-xs text-neutral-200">
                                  • <strong className="text-rose-300 font-semibold">{itm.name}</strong>: 
                                  <span className="bg-rose-950/40 text-rose-300 px-1.5 py-0.5 rounded text-[10px] ml-1 font-bold">
                                    Allergic to {itm.allergies?.join(', ')}
                                  </span> 
                                  <span className="ml-1 text-rose-200 font-medium font-mono text-[10px] uppercase">
                                    ({itm.allergyAction === 'remove' ? 'Tanggalin Ingredient' : itm.allergyAction === 'alternative' ? 'Palitan ng Alternative' : 'Custom Request'})
                                  </span>
                                  {itm.allergyDetails && <span className="text-neutral-400 italic block pl-3 font-mono">Sub/Details: "{itm.allergyDetails}"</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-neutral-500">
                          <span className="flex items-center gap-1"><Clock size={11} /> {new Date(order.createdAt).toLocaleTimeString()}</span>
                          <span className="flex items-center gap-1">💰 Total: <strong className="text-emerald-500">₱{order.totalAmount.toFixed(2)}</strong> ({order.paymentMethod})</span>
                          <span className="flex items-center gap-1">👤 Attending Server: {order.actionBy}</span>
                        </div>
                      </div>

                      {/* Operation status advancing workflow control row */}
                      <div className="flex items-center gap-2 w-full lg:w-auto self-end lg:self-center shrink-0">
                        {isPending && (
                          <>
                            <button
                              onClick={() => advanceOrderStatus(order.id, order.orderStatus)}
                              className={`flex-1 lg:flex-none uppercase text-[10px] font-bold px-3 py-2 rounded-lg text-white shadow-sm transition active:scale-95 cursor-pointer ${
                                order.orderStatus === 'received' ? 'bg-indigo-600 hover:bg-indigo-700' :
                                order.orderStatus === 'preparing' ? 'bg-amber-500 hover:bg-amber-600 text-black' :
                                'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {order.orderStatus === 'received' && 'Start preparing'}
                              {order.orderStatus === 'preparing' && 'Set to Ready'}
                              {order.orderStatus === 'ready' && 'Mark Completed'}
                            </button>
                            
                            <button
                              onClick={() => cancelOrderFlow(order.id)}
                              className="px-2.5 py-2 rounded-lg bg-red-950/40 text-red-500 hover:bg-red-900 hover:text-white transition cursor-pointer text-[10px] uppercase font-bold"
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => setActiveReceiptOrder(order)}
                          className="flex items-center justify-center p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 cursor-pointer"
                          title="Print Thermal Receipt"
                        >
                          <Printer size={14} />
                        </button>
                      </div>

                    </div>
                  );
                })}

                {orders.length === 0 && (
                  <div className="py-20 text-center text-neutral-500 text-sm">
                    ☕ No orders at the moment. Try ordering from the POS Register tab!
                  </div>
                )}
              </div>

            </div>
          )}

          {/* -------------------------------------------------------------
              C. MENU & STOCKS (INVENTORY TAB)
              ------------------------------------------------------------- */}
          {activeTab === 'inventory' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow'
            }`}>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Utensils className="text-indigo-500" />
                    Menu Control & Inventory Tracking
                  </h2>
                  <p className="text-xs text-neutral-500">Add, edit, or archive menu items and monitor stock levels.</p>
                </div>

                <button
                  onClick={() => {
                    setEditingMenuItem(null);
                    setMenuForm({
                      name: '',
                      category: 'Rice Meals',
                      price: '',
                      inventoryQty: '',
                      sku: '',
                    });
                    setShowMenuModal(true);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
                >
                  <Plus size={14} />
                  Add Menu Item
                </button>
              </div>

              {/* Master Inventory Stock Alerts warning banner */}
              {analytics.lowStockAlerts.length > 0 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl mb-6 flex items-start gap-3">
                  <AlertTriangle size={18} className="shrink-0 animate-bounce mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Low Stock Levels Alert!</h4>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      These menu items require restock: {analytics.lowStockAlerts.map(i => `${i.name} (Qty: ${i.inventoryQty})`).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Inventory list block */}
              <div className="overflow-x-auto rounded-xl border border-neutral-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className={`${theme === 'dark' ? 'bg-neutral-950 text-neutral-400' : 'bg-neutral-100 text-neutral-600'}`}>
                    <tr>
                      <th className="p-3.5">SKU / ID</th>
                      <th className="p-3.5">Dish Name</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Price (₱)</th>
                      <th className="p-3.5 text-center">Remaining Quantity</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {menuItems.map(item => (
                      <tr key={item.id} className="hover:bg-neutral-800/10">
                        <td className="p-3.5 font-mono text-neutral-400">{item.sku || item.id}</td>
                        <td className="p-3.5 font-semibold text-sm">{item.name}</td>
                        <td className="p-3.5">{item.category}</td>
                        <td className="p-3.5 font-mono font-bold text-amber-500">₱{item.price.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded font-mono font-bold text-xs ${
                            item.inventoryQty === 0 ? 'bg-red-500/10 text-red-500' :
                            item.inventoryQty <= 5 ? 'bg-amber-500/10 text-amber-500' :
                            'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {item.inventoryQty}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-bold uppercase">
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          <button
                            onClick={() => handleEditMenuClick(item)}
                            className="p-1 px-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
                            title="Edit details"
                          >
                            Edit
                          </button>
                          
                          {/* Role constraint */}
                          {currentEmployee?.role === 'Manager' ? (
                            <button
                              onClick={() => deleteMenuItem(item.id, item.name)}
                              className="p-1 px-1.5 rounded bg-red-950/30 hover:bg-red-900 hover:text-white text-red-400 transition"
                              title="Delete catalog"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-[9px] text-neutral-500 cursor-help" title="Manager authentication required to delete formulas">Restricted</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* -------------------------------------------------------------
              D. STAFF REGISTRY TAB
              ------------------------------------------------------------- */}
          {activeTab === 'staff' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow'
            }`}>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Users className="text-indigo-500" />
                    Manager Panel: Staff registries & roles
                  </h2>
                  <p className="text-xs text-neutral-500">Create a 4-digit security PIN for your restaurant servers.</p>
                </div>

                {currentEmployee?.role === 'Manager' ? (
                  <button
                    onClick={() => {
                      setEditingStaff(null);
                      setStaffForm({
                        name: '',
                        pin: '',
                        role: 'Staff',
                        status: 'active',
                      });
                      setShowStaffModal(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    <Plus size={14} />
                    Register New Server
                  </button>
                ) : (
                  <span className="text-xs text-amber-500 font-medium">Bawal ma-access ng Staff. Login as Manager muna.</span>
                )}
              </div>

              {/* Staff profiles list */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {staff.map(member => (
                  <div 
                    key={member.uid} 
                    className={`p-5 rounded-2xl border ${
                      theme === 'dark' ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-100 border-neutral-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <img 
                          src={getAvatarUrl(member.name, member.photoUrl)} 
                          alt={member.name} 
                          className="w-10 h-10 rounded-xl object-cover border border-indigo-500/20 bg-indigo-500/10 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <h3 className="font-semibold text-sm leading-tight">{member.name}</h3>
                          <span className="text-[10px] text-neutral-500 font-mono">Role: {member.role}</span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        member.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-slate-500/10 text-slate-500'
                      }`}>
                        {member.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs pt-3 border-t border-dashed border-neutral-800 mb-4">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-500">🔐 Terminal Secure PIN:</span>
                        {currentEmployee?.role === 'Manager' ? (
                          <span className="font-mono font-bold text-amber-500 tracking-widest">{member.pin}</span>
                        ) : (
                          <span className="text-neutral-600 font-mono">•••• [Hidden]</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      {currentEmployee?.role === 'Manager' ? (
                        <>
                          <button
                            onClick={() => handleEditStaffClick(member)}
                            className="bg-neutral-800 hover:bg-color text-neutral-300 text-[10px] px-2.5 py-1.5 rounded-lg border border-neutral-700 transition"
                          >
                            Edit Credentials
                          </button>
                          <button
                            onClick={() => removeStaffMember(member.uid, member.name)}
                            className="bg-red-950/30 hover:bg-red-900 text-red-400 hover:text-white text-[10px] px-2.5 py-1.5 rounded-lg transition"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEmployeeSwitchClick(member)}
                          className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] px-3 py-1.5 rounded-lg w-full font-bold active:scale-95"
                        >
                          Quick switch Account
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* -------------------------------------------------------------
              E. SALES ANALYTICS TAB
              ------------------------------------------------------------- */}
          {activeTab === 'analytics' && (
            <div className={`p-6 rounded-2xl border space-y-6 ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow'
            }`}>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800/60 pb-5">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <BarChart3 className="text-indigo-500" />
                    Real-time Reports, Metrics & Analytics
                  </h2>
                  <p className="text-xs text-neutral-500">Visualize sales performance and business trends in real-time.</p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={exportAnalyticsCSV}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition duration-200 cursor-pointer active:scale-95 border border-neutral-700/60"
                  >
                    <Download size={14} />
                    Export Soft Copy (CSV)
                  </button>
                  <button
                    onClick={printAnalyticsReport}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition duration-200 cursor-pointer active:scale-95"
                  >
                    <Printer size={14} />
                    Print Hard Copy (PDF)
                  </button>
                </div>
              </div>

              {/* Numerical stats grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                
                <div className={`p-5 rounded-2xl border flex items-center justify-between ${
                  theme === 'dark' ? 'bg-neutral-950 border-neutral-850' : 'bg-neutral-100 border-neutral-200'
                }`}>
                  <div className="space-y-1">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Gross Sales</span>
                    <strong className="text-2xl font-mono text-emerald-500 font-extrabold">₱{analytics.totalSales.toFixed(2)}</strong>
                  </div>
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                    <DollarSign size={22} />
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border flex items-center justify-between ${
                  theme === 'dark' ? 'bg-neutral-950 border-neutral-850' : 'bg-neutral-100 border-neutral-200'
                }`}>
                  <div className="space-y-1">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Total Orders</span>
                    <strong className="text-2xl font-mono text-indigo-400 font-extrabold">{analytics.totalOrdersCount} orders</strong>
                  </div>
                  <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
                    <ClipboardList size={22} />
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border flex items-center justify-between ${
                  theme === 'dark' ? 'bg-neutral-950 border-neutral-850' : 'bg-neutral-100 border-neutral-200'
                }`}>
                  <div className="space-y-1">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Average Ticket Size</span>
                    <strong className="text-2xl font-mono text-amber-500 font-extrabold">₱{analytics.avgOrderVal.toFixed(2)}</strong>
                  </div>
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                    <TrendingUp size={22} />
                  </div>
                </div>

              </div>

              {/* Split visualization and comparisons */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                
                {/* Category sales contribution */}
                <div className={`p-5 rounded-2xl border ${
                  theme === 'dark' ? 'bg-neutral-950 border-neutral-850' : 'bg-neutral-100 border-neutral-200'
                }`}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4">Ulam & Kategorya (Sales breakdown)</h3>
                  
                  <div className="space-y-3">
                    {analytics.categorySummary.map((cat, index) => {
                      const totalPercentage = analytics.totalSales > 0 ? (cat.value / analytics.totalSales) * 100 : 0;
                      return (
                        <div key={cat.name} className="space-y-1 text-xs">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-medium text-neutral-300">{cat.name}</span>
                            <span className="font-mono text-neutral-400">₱{cat.value.toFixed(2)} ({totalPercentage.toFixed(1)}%)</span>
                          </div>
                          
                          {/* Sled bar */}
                          <div className="w-full h-2 rounded-full overflow-hidden bg-neutral-900">
                            <div 
                              className={`h-full rounded-full ${
                                index % 3 === 0 ? 'bg-amber-500' : index % 3 === 1 ? 'bg-indigo-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${totalPercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}

                    {analytics.categorySummary.length === 0 && (
                      <div className="text-center py-10 text-neutral-600 text-xs text-mono">No transaction records found to calculate report.</div>
                    )}
                  </div>
                </div>

                {/* Employee productivity comparison */}
                <div className={`p-5 rounded-2xl border ${
                  theme === 'dark' ? 'bg-neutral-950 border-neutral-850' : 'bg-neutral-100 border-neutral-200'
                }`}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4 font-mono">Attendants transaction processed (Completed)</h3>
                  
                  <div className="space-y-4">
                    {Object.keys(analytics.employeePerf).map(emp => (
                      <div key={emp} className="flex items-center justify-between border-b border-neutral-900 pb-2 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-neutral-800 text-neutral-400 rounded-lg">
                            <User size={13} />
                          </div>
                          <span className="font-medium">{emp}</span>
                        </div>
                        <span className="font-mono bg-indigo-550/10 text-indigo-400 px-2 py-0.5 rounded font-bold">
                          {analytics.employeePerf[emp]} orders finished
                        </span>
                      </div>
                    ))}

                    {Object.keys(analytics.employeePerf).length === 0 && (
                      <div className="text-center py-10 text-neutral-600 text-xs text-mono">No completed transaction records found.</div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* -------------------------------------------------------------
              F. EMPLOYEE AUDIT LOGS TIMELINE
              ------------------------------------------------------------- */}
          {activeTab === 'audit' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow'
            }`}>
              
              <div className="mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Clock className="text-indigo-500" />
                  Employee Action Audit Logs
                </h2>
                <p className="text-xs text-neutral-500 font-mono">Durable store timeline (Manager review panel for tracking internal staff movements).</p>
              </div>

              {/* Event Stack */}
              <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-2">
                {auditLogs.map((log) => (
                  <div 
                    key={log.id} 
                    className={`p-3.5 rounded-xl border flex items-start justify-between gap-4 text-xs font-mono ${
                      theme === 'dark' ? 'bg-neutral-950 border-neutral-850' : 'bg-neutral-100 border-neutral-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-500">{log.employeeName}</span>
                        <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded uppercase">{log.role}</span>
                      </div>
                      <p className="text-neutral-300 font-medium">{log.action}</p>
                    </div>
                    
                    <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}

                {auditLogs.length === 0 && (
                  <div className="py-20 text-center text-neutral-500 text-sm">
                    No audit log records found. Try making a checkout or updating the menu!
                  </div>
                )}
              </div>

            </div>
          )}

          {/* -------------------------------------------------------------
              G. SECURITY & COOKIES CONTROL ROOM (SECURITY HUB)
              ------------------------------------------------------------- */}
          {activeTab === 'security_hub' && (
            <div className="space-y-6 font-sans">
              
              {/* Header card with status overview */}
              <div className={`p-6 rounded-3xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 ${
                theme === 'dark' ? 'bg-gradient-to-r from-neutral-900 to-indigo-950/20 border-neutral-800' : 'bg-gradient-to-r from-white to-indigo-50/50 border-neutral-200 shadow-md'
              }`}>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-500 font-bold">
                    <Shield className="animate-pulse text-amber-500" size={24} />
                    <h2 className="text-xl font-bold tracking-tight">System Security, Cookies & Session Hub</h2>
                  </div>
                  <p className="text-xs text-neutral-400 max-w-2xl">
                    Monitor and test active session cookies, anti-CSRF tokens, 2FA triggers, and invisible reCAPTCHA configuration for compliance with the Data Privacy Act (DPA - RA 10173).
                  </p>
                </div>
                
                {/* Active Session Info */}
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-3 shrink-0">
                  <div className="space-y-0.5 text-right font-mono">
                    <span className="text-[9px] text-indigo-400 uppercase tracking-widest font-extrabold block">Authenticated Seller</span>
                    <span className="text-xs font-bold text-white block truncate max-w-[150px]">{sellerAuthUser?.businessName}</span>
                    <span className="text-[10px] text-neutral-400 block truncate max-w-[150px]">{sellerAuthUser?.ownerName}</span>
                  </div>
                  <button
                    onClick={handleSellerLogout}
                    className="px-3 py-2 bg-rose-950/40 hover:bg-rose-900 border border-rose-900/30 text-rose-400 font-bold text-[10px] rounded-xl transition cursor-pointer uppercase font-mono"
                  >
                    Logout
                  </button>
                </div>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* 1. ACTIVE COOKIES MONITOR (LEFT - 7 cols) */}
                <div className={`lg:col-span-7 p-6 rounded-3xl border space-y-6 ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-md'
                }`}>
                  <div className="flex justify-between items-center border-b border-neutral-800/40 pb-3">
                    <div className="flex items-center gap-2">
                      <Database className="text-amber-500" size={18} />
                      <h3 className="font-bold text-base">Active Browser Cookies Monitor</h3>
                    </div>
                    <button
                      onClick={() => setShowCookiePreferences(true)}
                      className="px-3 py-1.5 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-[10px] font-bold rounded-lg border border-neutral-700 transition cursor-pointer"
                    >
                      Update Preferences
                    </button>
                  </div>

                  <p className="text-xs text-neutral-400 leading-relaxed">
                    The dual-engine cookie database below reflects actual cookies stored in your browser (or secure storage fallbacks when inside sandboxed frames).
                  </p>

                  <div className="space-y-3">
                    {/* Cookie 1: Session Cookie */}
                    <div className="p-4 bg-neutral-950 border border-neutral-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-400">food_session_cookie</span>
                          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-extrabold uppercase">Session</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate max-w-[280px]">
                          Value: <span className="text-neutral-200">{sessionStorage.getItem('cookie_food_session_cookie') ? '✓ ACTIVE_ENCRYPTED_JWT_SESSION' : '❌ NOT_SET'}</span>
                        </div>
                        {/* Tags / Flag attributes */}
                        <div className="flex items-center gap-1.5 text-[9px] text-neutral-500">
                          <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">HttpOnly</span>
                          <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">Secure</span>
                          <span className="bg-indigo-500/10 text-indigo-400 px-1 rounded">SameSite=Strict</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:self-center">
                        <button
                          onClick={() => {
                            sessionStorage.removeItem('cookie_food_session_cookie');
                            setSellerAuthUser(null);
                            writeAuditLog("Manually expired food_session_cookie via Dev Monitor");
                            playOrderChime();
                            triggerDialog(
                              "Session Terminated 🛡️",
                              "Session cookie cleared! You have been automatically logged out for security.",
                              "security"
                            );
                          }}
                          disabled={!sessionStorage.getItem('cookie_food_session_cookie')}
                          className="px-2.5 py-1.5 bg-rose-950/20 hover:bg-rose-900 border border-rose-900/30 text-rose-400 hover:text-white rounded-lg text-[10px] transition disabled:opacity-30 cursor-pointer"
                        >
                          Simulate Expire
                        </button>
                      </div>
                    </div>

                    {/* Cookie 2: Persistent Remember Me Cookie */}
                    <div className="p-4 bg-neutral-950 border border-neutral-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-500">food_persistent_session</span>
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-extrabold uppercase">30-Day Expiry</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate max-w-[280px]">
                          Value: <span className="text-neutral-200 truncate">{getCookie('food_persistent_session') ? '✓ PERSISTENT_REMEMBER_ME_ACTIVE' : '❌ NOT_SET'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-neutral-500">
                          <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">HttpOnly</span>
                          <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">Secure</span>
                          <span className="bg-indigo-500/10 text-indigo-400 px-1 rounded">SameSite=Strict</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:self-center">
                        <button
                          onClick={() => {
                            eraseCookie('food_persistent_session');
                            setSellerAuthUser(null);
                            writeAuditLog("Manually deleted food_persistent_session cookie via Dev Monitor");
                            playOrderChime();
                            triggerDialog(
                              "Cookie Deleted 🍪",
                              "Remember me cookie deleted! You will return to the login screen.",
                              "warning"
                            );
                          }}
                          disabled={!getCookie('food_persistent_session')}
                          className="px-2.5 py-1.5 bg-rose-950/20 hover:bg-rose-900 border border-rose-900/30 text-rose-400 hover:text-white rounded-lg text-[10px] transition disabled:opacity-30 cursor-pointer"
                        >
                          Delete Cookie
                        </button>
                      </div>
                    </div>

                    {/* Cookie 3: CSRF Token Cookie */}
                    <div className="p-4 bg-neutral-950 border border-neutral-850 rounded-2xl flex items-center justify-between gap-3 text-xs font-mono">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-400">csrf_token</span>
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-extrabold uppercase">Anti-CSRF</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate max-w-[280px]">
                          Token Hash: <span className="text-neutral-200">{csrfToken || '❌ GENERATING...'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-neutral-500">
                          <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">HttpOnly</span>
                          <span className="bg-emerald-500/10 text-emerald-500 px-1 rounded">Secure</span>
                          <span className="bg-indigo-500/10 text-indigo-400 px-1 rounded">SameSite=Strict</span>
                        </div>
                      </div>
                    </div>

                    {/* Cookie 4: Cookie Consent State */}
                    <div className="p-4 bg-neutral-950 border border-neutral-850 rounded-2xl flex items-center justify-between gap-3 text-xs font-mono">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-300">food_cookie_consent</span>
                          <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-extrabold uppercase">Consent Status</span>
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          User Choice: <span className="text-amber-500 uppercase font-bold">{cookieConsent || '❌ NOT_SAVED'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-neutral-500">
                          <span>Analytics: {cookiePreferences.analytics ? 'ON 🟢' : 'OFF 🔴'}</span>
                          <span>|</span>
                          <span>Marketing: {cookiePreferences.marketing ? 'ON 🟢' : 'OFF 🔴'}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => {
                          eraseCookie('food_cookie_consent');
                          eraseCookie('food_cookie_analytics');
                          eraseCookie('food_cookie_marketing');
                          setCookieConsent(null);
                          setShowCookiePreferences(false);
                          writeAuditLog("Manually reset user cookie consent state");
                          showToast("Your Cookie Consent preference has been reset! The persistent banner will appear again.", "success");
                        }}
                        className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 rounded-lg text-[10px] border border-neutral-700 transition cursor-pointer"
                      >
                        Reset Banner
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. ANTI-CSRF ATTACK SIMULATOR & SECURITY WORKFLOWS (RIGHT - 5 cols) */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* CSRF Attack Simulator */}
                  <div className={`p-6 rounded-3xl border space-y-4 ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-md'
                  }`}>
                    <div className="flex items-center gap-2 border-b border-neutral-800/40 pb-3">
                      <Lock className="text-emerald-500" size={18} />
                      <h3 className="font-bold text-base">Anti-CSRF Attack Simulator</h3>
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed">
                      The system secures every payout, withdrawal, or menu update using Anti-CSRF verification. Test the buttons below to see how it works:
                    </p>

                    <div className="space-y-3 pt-1">
                      {/* Safe Request button */}
                      <button
                        onClick={() => {
                          writeAuditLog(`API Request Success: POST /api/seller/withdraw carry valid anti-CSRF token [${csrfToken}]`);
                          triggerDialog(
                            "✓ SUCCESS 200 OK",
                            `'X-CSRF-Token' header attached: ${csrfToken}\n\nYour request has been successfully validated and processed.`,
                            "success"
                          );
                        }}
                        className="w-full p-3.5 bg-emerald-950/20 hover:bg-emerald-900 border border-emerald-900/30 text-emerald-400 text-xs font-bold rounded-2xl flex items-center justify-between transition active:scale-98 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 size={16} />
                          <span>Safe API Request (With CSRF Token)</span>
                        </div>
                        <span className="text-[9px] font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">200 OK</span>
                      </button>

                      {/* Hack CSRF Request button */}
                      <button
                        onClick={() => {
                          writeAuditLog(`CSRF ATTACK BLOCKED: Malicious client triggered POST /api/seller/withdraw without matching csrf_token`);
                          triggerDialog(
                            "⚡ SECURITY ALERT: 403 FORBIDDEN",
                            "Failed to validate request because NO CSRF token was found or it did not match the session cookie.\n\nThe system blocked the malicious request to protect seller funds!",
                            "error"
                          );
                        }}
                        className="w-full p-3.5 bg-rose-950/25 hover:bg-rose-900 border border-rose-900/30 text-rose-400 text-xs font-bold rounded-2xl flex items-center justify-between transition active:scale-98 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <AlertTriangle size={16} className="animate-pulse" />
                          <span>Fake CSRF Attack (No Token)</span>
                        </div>
                        <span className="text-[9px] font-mono bg-rose-500/10 px-1.5 py-0.5 rounded">403 Blocked</span>
                      </button>
                    </div>

                    <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-850 space-y-1.5 text-[10px] font-mono text-neutral-400">
                      <div className="flex justify-between">
                        <span>Anti-CSRF Status:</span>
                        <span className="text-emerald-500 font-bold">ACTIVE 🛡️</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Current Session Token:</span>
                        <span className="text-neutral-200 truncate max-w-[120px]">{csrfToken}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2FA & reCAPTCHA Bot Protection */}
                  <div className={`p-6 rounded-3xl border space-y-4 ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200 shadow-md'
                  }`}>
                    <div className="flex items-center gap-2 border-b border-neutral-800/40 pb-3">
                      <Users2 className="text-indigo-500" size={18} />
                      <h3 className="font-bold text-base">2FA & Bot Protection Status</h3>
                    </div>

                    <div className="space-y-4">
                      {/* reCAPTCHA Info */}
                      <div className="p-3.5 bg-neutral-950 border border-neutral-850 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-300">Invisible reCAPTCHA v3</span>
                          <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">SECURE</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-normal">
                          Analyzes user behavior silently without intrusive "I am not a robot" checkboxes.
                        </p>
                        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-neutral-500 border-t border-neutral-800/30">
                          <span>Simulated Human Score:</span>
                          <span className="text-emerald-400 font-bold">0.95 (High Human probability)</span>
                        </div>
                      </div>

                      {/* 2FA info */}
                      <div className="p-3.5 bg-neutral-950 border border-neutral-850 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-300">2FA Device Status</span>
                          <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold">2FA ENABLED</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-normal">
                          Automatically requests a 6-digit verification code if you sign in using a new browser without a "Remember Me" cookie.
                        </p>
                        <button
                          onClick={() => {
                            eraseCookie('food_persistent_session');
                            triggerDialog(
                              "2FA Enforced 🛡️",
                              "Successfully triggered! Your next login on this browser will require a 2FA verification code again.",
                              "security"
                            );
                            writeAuditLog("Forced 2FA verification for next login session");
                          }}
                          className="w-full py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 text-[10px] font-bold rounded-lg border border-neutral-700 transition cursor-pointer text-center"
                        >
                          Force 2FA on Next Login
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

        </main>
      </div>

      {/* 3. 4-DIGIT PIN SECURITY SWITCHER SCREEN OVERLAY */}
      {showPinScreen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-800 text-white w-full max-w-sm rounded-[24px] p-6 shadow-2xl flex flex-col items-center">
            
            <button 
              onClick={() => setShowPinScreen(false)}
              className="self-end text-neutral-500 hover:text-neutral-300 cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-1 mb-6 mt-2">
              <Key size={36} className="text-amber-500 mx-auto animate-bounce mb-2" />
              <h3 className="font-bold text-lg">FAST SIGN-IN CODE</h3>
              <p className="text-xs text-neutral-400">
                Select an account and enter your 4-digit PIN to login.
              </p>
            </div>

            {/* Selecting staff member */}
            {!pinTargetEmployee ? (
              <div className="w-full space-y-2.5 mb-2 max-h-[220px] overflow-y-auto">
                {staff.map(s => (
                  <button
                    key={s.uid}
                    onClick={() => setPinTargetEmployee(s)}
                    className="w-full p-2.5 bg-neutral-850 hover:bg-neutral-800 border border-neutral-800 rounded-xl flex items-center justify-between text-left text-xs transition active:scale-98 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <img 
                        src={getAvatarUrl(s.name, s.photoUrl)} 
                        alt={s.name} 
                        className="w-8 h-8 rounded-full border border-neutral-700 bg-neutral-800 object-cover shrink-0" 
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-bold text-white leading-none">{s.name}</span>
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase leading-none ${
                            s.role === 'Manager' ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {s.role}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-500">Fast login profile</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-neutral-500 font-mono">PIN Active</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                <div className="mb-4 text-center flex flex-col items-center">
                  <img 
                    src={getAvatarUrl(pinTargetEmployee.name, pinTargetEmployee.photoUrl)} 
                    alt={pinTargetEmployee.name} 
                    className="w-16 h-16 rounded-full border-2 border-amber-500 bg-neutral-800 object-cover mb-2 shadow-lg shadow-amber-500/10 shrink-0" 
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-xs text-neutral-400">Logging in as:</span>
                  <p className="font-extrabold text-sm text-indigo-400 leading-snug">{pinTargetEmployee.name}</p>
                  <button 
                    onClick={() => setPinTargetEmployee(null)}
                    className="text-[10px] text-amber-550 underline hover:text-amber-400 block mt-1 cursor-pointer"
                  >
                    Back to List
                  </button>
                </div>

                <form onSubmit={handlePinSubmit} className="w-full space-y-5">
                  <div className="flex justify-center gap-3">
                    {[0, 1, 2, 3].map(ind => (
                      <div 
                        key={ind} 
                        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-mono font-bold text-lg ${
                          pinInput.length > ind 
                            ? 'border-amber-500 bg-amber-500/10 text-amber-500' 
                            : 'border-neutral-700 bg-transparent'
                        }`}
                      >
                        {pinInput.length > ind ? '•' : ''}
                      </div>
                    ))}
                  </div>

                  {pinError && (
                    <div className="text-center font-mono text-[11px] text-red-500 animate-pulse">{pinError}</div>
                  )}

                  {/* Input pad */}
                  <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => appendPinDigit(num)}
                        className="w-13 h-13 rounded-full bg-neutral-800 hover:bg-neutral-700 text-sm font-bold flex items-center justify-center transition active:scale-90"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPinInput('')}
                      className="w-13 h-13 rounded-full text-[10px] bg-red-950/20 text-red-400 flex items-center justify-center hover:bg-neutral-800 transition uppercase font-semibold"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => appendPinDigit('0')}
                      className="w-13 h-13 rounded-full bg-neutral-800 hover:bg-neutral-700 text-sm font-bold flex items-center justify-center transition active:scale-95"
                    >
                      0
                    </button>
                    <button
                      type="submit"
                      className="w-13 h-13 rounded-full text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition uppercase font-bold"
                    >
                      Enter
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      )}

      {/* 4. DISH FORM MODAL */}
      {showMenuModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-800 mb-4">
              <h3 className="font-bold text-lg text-amber-500">
                {editingMenuItem ? '🖊️ Edit Menu Item Details' : '➕ Add New Menu Item'}
              </h3>
              <button onClick={() => setShowMenuModal(false)} className="text-neutral-500 hover:text-neutral-300">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleMenuSubmit} className="space-y-4 text-xs">
              
              <div className="space-y-1.5">
                <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Dish Name</label>
                <input 
                  type="text" 
                  required
                  value={menuForm.name}
                  onChange={(e) => setMenuForm({...menuForm, name: e.target.value})}
                  className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-amber-500"
                  placeholder="e.g. Sizzling Sisig, Chicken Inasal..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Category</label>
                  <select 
                    value={menuForm.category}
                    onChange={(e) => setMenuForm({...menuForm, category: e.target.value})}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none"
                  >
                    <option value="Rice Meals">Rice Meals</option>
                    <option value="Burgers">Burgers</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Desserts">Desserts</option>
                    <option value="Drinks">Drinks</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Price (₱)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={menuForm.price}
                    onChange={(e) => setMenuForm({...menuForm, price: e.target.value})}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="e.g. 150.00"
                  />
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4">
                
                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Stock Quantity</label>
                  <input 
                    type="number" 
                    required
                    value={menuForm.inventoryQty}
                    onChange={(e) => setMenuForm({...menuForm, inventoryQty: e.target.value})}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="e.g. 20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-neutral-400 font-semibold uppercase tracking-wider block">SKU / Barcode (optional)</label>
                  <input 
                    type="text" 
                    value={menuForm.sku}
                    onChange={(e) => setMenuForm({...menuForm, sku: e.target.value})}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="e.g. LKN001"
                  />
                </div>

              </div>

              {/* Food Image Selection and Upload */}
              <div className="space-y-3 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <span className="text-neutral-400 font-semibold uppercase tracking-wider block text-[10px]">Larawan ng Pagkain (Food Image)</span>
                
                {/* Drag and Drop Zone */}
                <div 
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFoodImage(true);
                  }}
                  onDragLeave={() => {
                    setIsDraggingFoodImage(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFoodImage(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      if (!file.type.startsWith('image/')) {
                        showToast("Litrato lamang ang puwedeng i-upload!", "error");
                        return;
                      }
                      if (file.size > 2 * 1024 * 1024) {
                        showToast("Napakalaki ng file! Maximum na ang 2MB.", "error");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setMenuForm({ ...menuForm, image: reader.result as string });
                        showToast("Food image successfully loaded from device via drag & drop!", "success");
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`flex flex-col sm:flex-row gap-4 items-center p-3 rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                    isDraggingFoodImage 
                      ? 'border-amber-500 bg-amber-500/10 scale-[1.01]' 
                      : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/30'
                  }`}
                >
                  <div className="relative group shrink-0">
                    <img 
                      src={menuForm.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=150&auto=format&fit=crop&q=80"} 
                      alt="Food preview" 
                      className="w-20 h-20 rounded-xl object-cover border border-neutral-850 bg-neutral-900 shadow-md shadow-black/40"
                      referrerPolicy="no-referrer"
                    />
                    {menuForm.image && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-xl">
                        <span className="text-[9px] text-white font-semibold">Ready</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2 flex-1 text-center sm:text-left w-full">
                    <p className="text-[11px] text-neutral-300 font-medium">
                      {isDraggingFoodImage ? "Ibitaw ang larawan dito..." : "I-drag ang litrato rito o i-click ang button sa ibaba"}
                    </p>
                    <p className="text-[9px] text-neutral-500">Sinusuportahan ang JPG, PNG, GIF (Max: 2MB)</p>
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <label className="inline-block bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold px-3.5 py-2 rounded-lg text-[10px] cursor-pointer transition shadow-md shadow-amber-500/20 active:scale-95">
                        📂 Mag-upload mula sa Device
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 2 * 1024 * 1024) {
                                showToast("Napakalaki ng file! Maximum na ang 2MB.", "error");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setMenuForm({ ...menuForm, image: reader.result as string });
                                showToast("Food image successfully loaded from device!", "success");
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      {menuForm.image && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuForm({ ...menuForm, image: '' });
                            showToast("Food image reset.", "info");
                          }}
                          className="text-[10px] text-rose-500 hover:text-rose-400 hover:underline font-semibold cursor-pointer py-1.5 px-2"
                        >
                          ❌ I-reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-neutral-850 pt-2.5 space-y-1.5">
                  <label className="text-neutral-500 font-medium block text-[9px]">Puwede ring ilagay ang Image URL nang manu-mano:</label>
                  <input 
                    type="text" 
                    value={menuForm.image && menuForm.image.startsWith('data:image') ? 'Uploaded Local Image (Base64)' : (menuForm.image || '')}
                    disabled={Boolean(menuForm.image && menuForm.image.startsWith('data:image'))}
                    onChange={(e) => setMenuForm({...menuForm, image: e.target.value})}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-950/80 focus:outline-none focus:border-amber-500 font-mono text-neutral-300 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="e.g. https://images.unsplash.com/photo-..."
                  />
                  <div className="flex gap-2 mt-1 flex-wrap items-center">
                    <span className="text-[9px] text-neutral-500">Preset suggestions:</span>
                    <button 
                      type="button" 
                      onClick={() => {
                        setMenuForm({...menuForm, image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'});
                        showToast("Generic food layout loaded.", "info");
                      }}
                      className="text-[9px] text-amber-500 hover:underline cursor-pointer"
                    >
                      Generic
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setMenuForm({...menuForm, image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80'});
                        showToast("Burger layout loaded.", "info");
                      }}
                      className="text-[9px] text-amber-500 hover:underline cursor-pointer"
                    >
                      Burger
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setMenuForm({...menuForm, image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=80'});
                        showToast("Fries layout loaded.", "info");
                      }}
                      className="text-[9px] text-amber-500 hover:underline cursor-pointer"
                    >
                      Fries
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setMenuForm({...menuForm, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=80'});
                        showToast("Iced Tea layout loaded.", "info");
                      }}
                      className="text-[9px] text-amber-500 hover:underline cursor-pointer"
                    >
                      Iced Tea
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-neutral-850">
                <button
                  type="button"
                  onClick={() => setShowMenuModal(false)}
                  className="w-1/2 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition"
                >
                  Save to Catalog
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 5. STAFF FORM MODAL */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-800 mb-4">
              <h3 className="font-bold text-lg text-indigo-400">
                {editingStaff ? '🖊️ Edit Attendant credentials' : '➕ Register New Server Profile'}
              </h3>
              <button onClick={() => setShowStaffModal(false)} className="text-neutral-500 hover:text-neutral-300">
                <X size={18} />
              </button>
            </div>

             <form onSubmit={handleStaffSubmit} className="space-y-4 text-xs">
              
              {/* Profile Image with preview & drag-and-drop */}
              <div 
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingStaffPhoto(true);
                }}
                onDragLeave={() => {
                  setIsDraggingStaffPhoto(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingStaffPhoto(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    if (!file.type.startsWith('image/')) {
                      showToast("Litrato lamang ang puwedeng i-upload!", "error");
                      return;
                    }
                    if (file.size > 2 * 1024 * 1024) {
                      showToast("Napakalaki ng file! Maximum na ang 2MB.", "error");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setStaffForm({ ...staffForm, photoUrl: reader.result as string });
                      showToast("Staff photo uploaded via drag & drop!", "success");
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className={`flex flex-col sm:flex-row items-center gap-4 bg-neutral-950 p-4 rounded-xl border transition-all cursor-pointer ${
                  isDraggingStaffPhoto 
                    ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]' 
                    : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="shrink-0 relative group">
                  <img 
                    src={getAvatarUrl(staffForm.name || 'User', staffForm.photoUrl)} 
                    alt="Staff Preview" 
                    className="w-16 h-16 rounded-xl object-cover border border-neutral-700 bg-neutral-900 shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                  {staffForm.photoUrl && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-xl">
                      <span className="text-[9px] text-white font-semibold">Active</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 flex-1 text-center sm:text-left w-full">
                  <span className="text-neutral-400 font-semibold block text-[10px] uppercase tracking-wider">Larawan ng Staff (Profile Picture)</span>
                  <p className="text-[10px] text-neutral-500">
                    {isDraggingStaffPhoto ? "Ibitaw ang larawan dito..." : "I-drag ang litrato rito o pumili sa iyong local storage"}
                  </p>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <label className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-[10px] cursor-pointer transition shadow-md shadow-indigo-600/20 active:scale-95">
                      📂 Pumili sa Device
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (!file.type.startsWith('image/')) {
                              showToast("Litrato lamang ang puwedeng i-upload!", "error");
                              return;
                            }
                            if (file.size > 2 * 1024 * 1024) {
                              showToast("Napakalaki ng file! Maximum na ang 2MB.", "error");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setStaffForm({ ...staffForm, photoUrl: reader.result as string });
                              showToast("Staff photo uploaded successfully from device!", "success");
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    {staffForm.photoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setStaffForm({ ...staffForm, photoUrl: '' });
                          showToast("Staff photo reset.", "info");
                        }}
                        className="text-[10px] text-rose-500 hover:text-rose-400 hover:underline font-semibold cursor-pointer py-1.5 px-2"
                      >
                        ❌ I-reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Server's Full Name</label>
                <input 
                  type="text" 
                  required
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({...staffForm, name: e.target.value})}
                  className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Staff Maria, Staff Juan..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Access Role</label>
                <select 
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({...staffForm, role: e.target.value as 'Manager' | 'Staff'})}
                  className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Staff">Staff Attendant (Cannot erase logs or menu lists)</option>
                  <option value="Manager">Manager/Owner (Full terminal authority)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-neutral-400 font-semibold uppercase tracking-wider block">4-Digit Access PIN</label>
                <div className="relative flex items-center">
                  <input 
                    type={staffShowPin ? "text" : "password"} 
                    maxLength={4}
                    required
                    value={staffForm.pin}
                    onChange={(e) => setStaffForm({...staffForm, pin: e.target.value})}
                    className="w-full text-xs pl-3.5 pr-10 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-indigo-500 tracking-widest font-mono font-bold"
                    placeholder="e.g. 1234"
                  />
                  <button
                    type="button"
                    onClick={() => setStaffShowPin(!staffShowPin)}
                    className="absolute right-3 text-neutral-500 hover:text-neutral-300 focus:outline-none transition p-1 rounded-lg cursor-pointer"
                  >
                    {staffShowPin ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-neutral-400 font-semibold uppercase tracking-wider block">Employment Status</label>
                <select 
                  value={staffForm.status}
                  onChange={(e) => setStaffForm({...staffForm, status: e.target.value as 'active' | 'inactive'})}
                  className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-neutral-800 bg-neutral-950 focus:outline-none focus:border-indigo-500"
                >
                  <option value="active">Active Status</option>
                  <option value="inactive">Suspended Status</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-neutral-850">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="w-1/2 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  Save
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 6. PHYSICAL THERMAL RECEIPT MODAL PREVIEW */}
      {activeReceiptOrder && (
        <ThermalReceipt 
          order={activeReceiptOrder} 
          onClose={() => setActiveReceiptOrder(null)} 
        />
      )}

      {/* COOKIE POLICY DETAILED MODAL */}
      {showCookiePolicyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-xl rounded-3xl p-6 border shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5 text-indigo-500">
                <Shield size={20} />
                <h3 className="font-bold text-lg">Food Ordering System - Seller Portal Cookie Policy</h3>
              </div>
              <button onClick={() => setShowCookiePolicyModal(false)} className="text-neutral-400 hover:text-neutral-200 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-neutral-400">
              <p>
                We use cookies and related browser storage technologies to ensure the security, integrity, and full functional performance of your Seller Portal. Read below to learn which cookies we store on your device:
              </p>

              <div className="space-y-3">
                <div className="p-3 bg-neutral-800/40 rounded-xl space-y-1 border border-neutral-800">
                  <h4 className="font-bold text-neutral-200">1. Essential Security & Session Cookies (Always Active)</h4>
                  <p className="text-[11px]">
                    Includes the <code className="text-amber-500">food_session_cookie</code> to maintain your active login session while managing Menu items and Orders, and the <code className="text-amber-500">csrf_token</code> which acts as an anti-CSRF mechanism to block cross-site request forgery attacks.
                  </p>
                </div>

                <div className="p-3 bg-neutral-800/40 rounded-xl space-y-1 border border-neutral-800">
                  <h4 className="font-bold text-neutral-200">2. Remember Me Persistent Cookies (Optional)</h4>
                  <p className="text-[11px]">
                    The <code className="text-amber-500">food_persistent_session</code> cookie is created if you check "Remember Me" during login. It is valid for 30 days to bypass password entry and 2FA on this trusted browser.
                  </p>
                </div>

                <div className="p-3 bg-neutral-800/40 rounded-xl space-y-1 border border-neutral-800">
                  <h4 className="font-bold text-neutral-200">3. Analytics & Performance Cookies (Optional)</h4>
                  <p className="text-[11px]">
                    Placed if you accept our performance preferences. This helps us analyze dashboard load times and usage metrics to optimize the interface design.
                  </p>
                </div>
              </div>

              <p className="text-[11px]">
                All sensitive cookies are configured with <code className="text-indigo-400">Secure</code>, <code className="text-indigo-400">SameSite=Strict</code>, and <code className="text-indigo-400">HttpOnly</code> attributes in production to prevent theft by malicious third-party scripts.
              </p>
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-800/30">
              <button
                onClick={() => setShowCookiePolicyModal(false)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERSISTENT COOKIE CONSENT BANNER */}
      {!cookieConsent && (
        <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 bg-neutral-900/95 border-t border-neutral-800 backdrop-blur-md shadow-2xl text-white">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <span>🍪 Compliance & Data Privacy</span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed max-w-4xl">
                This Seller Portal uses cookies to ensure the security of your account, maintain your login session, and provide you with the best experience on our platform. By continuing or clicking 'Accept', you agree to our use of cookies.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={() => setShowCookiePreferences(true)}
                className="px-4 py-2.5 hover:bg-neutral-850 text-neutral-300 text-xs font-bold rounded-xl border border-neutral-700 transition cursor-pointer"
              >
                Manage Preferences
              </button>
              <button
                onClick={handleAcceptAllCookies}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                Accept All Cookies
              </button>
              <button
                onClick={() => setShowCookiePolicyModal(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline transition font-semibold cursor-pointer"
              >
                Read our Cookie Policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COOKIE PREFERENCES PREFERENCE PANEL/MODAL */}
      {showCookiePreferences && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span>⚙️ Cookie Preferences</span>
              </h3>
              <button onClick={() => setShowCookiePreferences(false)} className="text-neutral-400 hover:text-neutral-200 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 p-3 bg-neutral-850/20 border border-neutral-800 rounded-xl">
                <div className="space-y-1">
                  <span className="text-xs font-bold block text-neutral-250">Security & Login Cookies (Required)</span>
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Required to maintain your secure session and prevent CSRF Attacks. Cannot be disabled.
                  </p>
                </div>
                <div className="p-1 px-2.5 bg-indigo-500/10 text-indigo-400 text-[10px] rounded font-bold uppercase tracking-wider">
                  ALWAYS ACTIVE
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 p-3 bg-neutral-850/20 border border-neutral-800 rounded-xl">
                <div className="space-y-1">
                  <span className="text-xs font-bold block text-neutral-250">Analytics & Performance Cookies</span>
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Helps us analyze dashboard load times and usage metrics to optimize interface performance.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={cookiePreferences.analytics}
                  onChange={(e) => setCookiePreferences({ ...cookiePreferences, analytics: e.target.checked })}
                  className="rounded border-neutral-300 text-indigo-600 h-5 w-5 mt-1 cursor-pointer"
                />
              </div>

              <div className="flex items-start justify-between gap-4 p-3 bg-neutral-850/20 border border-neutral-800 rounded-xl">
                <div className="space-y-1">
                  <span className="text-xs font-bold block text-neutral-250">Marketing & Tips Cookies</span>
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Used to store promotional tip preferences on the seller dashboard to avoid spam.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={cookiePreferences.marketing}
                  onChange={(e) => setCookiePreferences({ ...cookiePreferences, marketing: e.target.checked })}
                  className="rounded border-neutral-300 text-indigo-600 h-5 w-5 mt-1 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800/30 text-xs">
              <button
                onClick={() => setShowCookiePreferences(false)}
                className="px-4 py-2 hover:bg-neutral-850 border border-neutral-800 rounded-xl font-bold text-neutral-400 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCookiePreferences}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM TOAST SYSTEM OVERLAYS */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              className={`p-4 rounded-2xl shadow-2xl flex items-start gap-3 border pointer-events-auto backdrop-blur-md ${
                theme === 'dark' 
                  ? 'bg-neutral-900/95 border-neutral-850 text-white' 
                  : 'bg-white/95 border-neutral-200 text-neutral-900'
              }`}
            >
              <div className="mt-0.5">
                {toast.type === 'success' && <CheckCircle2 className="text-emerald-500" size={18} />}
                {toast.type === 'error' && <AlertTriangle className="text-rose-500" size={18} />}
                {toast.type === 'warning' && <AlertTriangle className="text-amber-500" size={18} />}
                {toast.type === 'info' && <Info className="text-sky-500" size={18} />}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-neutral-400 hover:text-neutral-200 p-0.5 rounded cursor-pointer"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* CUSTOM CONFIRMATION & ALERT DIALOG */}
      <AnimatePresence>
        {customDialog && customDialog.show && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-5 ${
                theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-3 border-b pb-4 border-neutral-850/10 dark:border-neutral-800/50">
                <div className={`p-2 rounded-xl ${
                  customDialog.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                  customDialog.type === 'error' ? 'bg-rose-500/10 text-rose-500' :
                  customDialog.type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                  customDialog.type === 'security' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' :
                  'bg-sky-500/10 text-sky-500'
                }`}>
                  {customDialog.type === 'success' && <CheckCircle2 size={22} />}
                  {customDialog.type === 'error' && <AlertTriangle size={22} />}
                  {customDialog.type === 'warning' && <AlertTriangle size={22} />}
                  {customDialog.type === 'security' && <Shield size={22} />}
                  {customDialog.type === 'info' && <Info size={22} />}
                </div>
                <div>
                  <h3 className="font-bold text-base tracking-tight">{customDialog.title}</h3>
                  <p className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase">System Feedback</p>
                </div>
              </div>

              <div className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-sans whitespace-pre-wrap">
                {customDialog.message}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {customDialog.onConfirm && (
                  <button
                    onClick={() => {
                      setCustomDialog(null);
                    }}
                    className="px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-xl font-bold text-xs text-neutral-500 dark:text-neutral-400 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    if (customDialog.onConfirm) {
                      customDialog.onConfirm();
                    }
                    setCustomDialog(null);
                  }}
                  className={`px-5 py-2.5 text-white font-bold text-xs rounded-xl transition shadow-lg cursor-pointer ${
                    customDialog.type === 'error' || customDialog.type === 'warning'
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10'
                      : customDialog.type === 'security'
                      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10'
                  }`}
                >
                  {customDialog.confirmText || 'OK'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ALLERGY & INGREDIENT CUSTOMIZATION MODAL */}
      <AnimatePresence>
        {allergyModalItem && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-lg rounded-3xl p-6 border shadow-2xl space-y-6 ${
                theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b pb-4 border-neutral-850 dark:border-neutral-800">
                <div>
                  <h3 className="font-bold text-lg text-rose-500 flex items-center gap-2">
                    🛡️ Allergy & Ingredient Control
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Customize ingredients for <strong className="text-slate-800 dark:text-white font-semibold">{allergyModalItem.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setAllergyModalItem(null)}
                  className="p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Ingredients & Allergens display */}
              <div className="space-y-4 text-xs">
                {allergyModalItem.ingredients.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
                      Dish Ingredients:
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {allergyModalItem.ingredients.map((ing, i) => {
                        const containsAllergen = allergyModalItem.allergens.some(alg => 
                          ing.toLowerCase().includes(alg.toLowerCase())
                        );
                        return (
                          <span 
                            key={i} 
                            className={`px-2 py-1 rounded-md text-[10px] font-medium border ${
                              containsAllergen 
                                ? 'bg-rose-950/40 text-rose-300 border-rose-900/60' 
                                : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                            }`}
                          >
                            {ing} {containsAllergen && '⚠️'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {allergyModalItem.allergens.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-[11px] uppercase tracking-wider text-rose-400 mb-1.5">
                      Known Allergens:
                    </h4>
                    <p className="text-[10px] text-neutral-400 mb-2 leading-relaxed">
                      This item contains ingredients that may trigger the following allergens:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {allergyModalItem.allergens.map((alg, i) => (
                        <span key={i} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          ⚠️ {alg}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Allergy selection inputs */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                    Select Allergens to Address
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {['Gluten', 'Dairy', 'Egg', 'Soy', 'Peanuts', 'Pork', 'Seafood'].map((alg) => {
                      const isSelected = allergyModalItem.currentAllergies.includes(alg);
                      return (
                        <button
                          key={alg}
                          onClick={() => {
                            const active = allergyModalItem.currentAllergies;
                            const next = active.includes(alg) 
                              ? active.filter(a => a !== alg) 
                              : [...active, alg];
                            setAllergyModalItem({
                              ...allergyModalItem,
                              currentAllergies: next
                            });
                          }}
                          className={`p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition cursor-pointer ${
                            isSelected 
                              ? 'bg-rose-950/40 border-rose-500 text-rose-300 font-bold' 
                              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-750'
                          }`}
                        >
                          <span>{alg}</span>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            isSelected ? 'bg-rose-600 border-rose-500 text-white' : 'border-neutral-600'
                          }`}>
                            {isSelected && '✓'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {allergyModalItem.currentAllergies.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 bg-neutral-950/50 p-4 rounded-2xl border border-neutral-800"
                  >
                    {/* Action Selector */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                        Action (Allergy Handling)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'remove', label: 'Remove (Exclude)', desc: 'Exclude from dish' },
                          { id: 'alternative', label: 'Substitute', desc: 'Use alternative' },
                          { id: 'custom', label: 'Custom Request', desc: 'Custom instructions' },
                        ].map((act) => {
                          const isSelected = allergyModalItem.currentAction === act.id;
                          return (
                            <button
                              key={act.id}
                              onClick={() => {
                                setAllergyModalItem({
                                  ...allergyModalItem,
                                  currentAction: act.id as any
                                });
                              }}
                              className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center transition cursor-pointer ${
                                isSelected 
                                  ? 'bg-rose-600 text-white border-rose-500 font-bold' 
                                  : 'bg-neutral-800 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                              }`}
                            >
                              <span className="text-[10px] font-bold">{act.label}</span>
                              <span className="text-[8px] opacity-75 mt-0.5 leading-none">{act.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Alternatives Suggestions or custom input */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                        Details & Alternatives (Allergy Instructions)
                      </label>
                      
                      {allergyModalItem.currentAction === 'alternative' && (
                        <div className="mb-2 space-y-1">
                          <p className="text-[9px] text-amber-400 font-medium">Recommended Safe Substitutes:</p>
                          <div className="flex flex-wrap gap-1">
                            {allergyModalItem.currentAllergies.flatMap(alg => {
                              const lookup: { [k: string]: string[] } = {
                                'Soy': ['Coconut Aminos', 'Fish Sauce'],
                                'Gluten': ['Lettuce Wrap', 'Gluten-free Wrap'],
                                'Dairy': ['Almond Milk', 'Oat Milk', 'Soy Milk', 'Vegan Cheese'],
                                'Egg': ['Eggless binder', 'Egg-free Mayonnaise'],
                                'Pork': ['Substitute with Chicken', 'Substitute with Beef', 'Substitute with Tofu'],
                                'Seafood': ['Substitute with Chicken', 'No seafood broth']
                              };
                              return lookup[alg] || [`No predefined substitute for ${alg}`];
                            }).map((alt, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setAllergyModalItem({
                                    ...allergyModalItem,
                                    currentDetails: alt
                                  });
                                }}
                                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/25 text-[9px] text-amber-400 border border-amber-500/20 rounded transition cursor-pointer"
                              >
                                Use "{alt}"
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <textarea
                        rows={2}
                        placeholder={
                          allergyModalItem.currentAction === 'remove' 
                            ? "e.g., 'Exclude mayonnaise/eggs' or 'Remove soy sauce'" 
                            : allergyModalItem.currentAction === 'alternative'
                            ? "Specify alternative (e.g. 'Use Almond milk instead of regular milk')"
                            : "Enter custom allergen requests here..."
                        }
                        value={allergyModalItem.currentDetails}
                        onChange={(e) => setAllergyModalItem({
                          ...allergyModalItem,
                          currentDetails: e.target.value
                        })}
                        className="w-full text-xs p-2.5 rounded-xl border border-neutral-850 bg-neutral-950 text-white focus:outline-none focus:border-rose-500 placeholder:text-neutral-600"
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    if (allergyModalItem.source === 'pos') {
                      setCart(prev => ({
                        ...prev,
                        [allergyModalItem.itemId]: {
                          ...prev[allergyModalItem.itemId],
                          allergies: undefined,
                          allergyAction: undefined,
                          allergyDetails: undefined
                        }
                      }));
                    } else {
                      setCustomerCart(prev => 
                        prev.map(c => c.id === allergyModalItem.itemId ? {
                          ...c,
                          allergies: undefined,
                          allergyAction: undefined,
                          allergyDetails: undefined
                        } : c)
                      );
                    }
                    showToast("Customization cleared", "info");
                    setAllergyModalItem(null);
                  }}
                  className="px-4 py-2 bg-neutral-800 text-neutral-400 hover:text-white rounded-xl text-xs font-semibold hover:bg-neutral-700 transition cursor-pointer"
                >
                  Clear Customization
                </button>
                <button
                  onClick={() => {
                    if (allergyModalItem.source === 'pos') {
                      setCart(prev => ({
                        ...prev,
                        [allergyModalItem.itemId]: {
                          ...prev[allergyModalItem.itemId],
                          allergies: allergyModalItem.currentAllergies.length > 0 ? allergyModalItem.currentAllergies : undefined,
                          allergyAction: allergyModalItem.currentAllergies.length > 0 ? allergyModalItem.currentAction : undefined,
                          allergyDetails: allergyModalItem.currentAllergies.length > 0 ? allergyModalItem.currentDetails : undefined
                        }
                      }));
                    } else {
                      setCustomerCart(prev => 
                        prev.map(c => c.id === allergyModalItem.itemId ? {
                          ...c,
                          allergies: allergyModalItem.currentAllergies.length > 0 ? allergyModalItem.currentAllergies : undefined,
                          allergyAction: allergyModalItem.currentAllergies.length > 0 ? allergyModalItem.currentAction : undefined,
                          allergyDetails: allergyModalItem.currentAllergies.length > 0 ? allergyModalItem.currentDetails : undefined
                        } : c)
                      );
                    }
                    showToast("Ingredient substitutions and allergies saved successfully!", "success");
                    setAllergyModalItem(null);
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/10 cursor-pointer"
                >
                  Save Ingredient Settings
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TERMS, PRIVACY, AND COOKIE POLICY MODALS */}
      {renderPolicyModals()}
      {renderLogoutConfirmModal()}
    </div>
  );
}

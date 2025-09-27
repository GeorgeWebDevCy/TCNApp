export type Language = 'en' | 'th';

export type TranslationValue = string | TranslationDictionary;

export interface TranslationDictionary {
  [key: string]: TranslationValue;
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    common: {
      appName: 'TCN',
      or: 'or',
    },
    languages: {
      en: 'English',
      th: 'Thai',
    },
    languageSwitcher: {
      label: 'Language',
      switchTo: 'Switch to {{language}}',
    },
    login: {
      header: {
        title: 'Welcome back',
        subtitle: 'Sign in to continue',
      },
      subtitle: 'Sign in to your account',
      greeting: 'Welcome back, {{name}}',
      lockMessage: 'Session locked. Use your PIN or biometrics to continue.',
      tabs: {
        password: 'Password',
        pin: 'PIN',
      },
      alerts: {
        cannotOpenLink: {
          title: 'Unable to open link',
          message: 'Please copy and open the link manually:\n{{url}}',
        },
        pinSaved: {
          title: 'PIN saved',
          message: 'You can now log in quickly using your PIN.',
        },
        pinRemoved: {
          title: 'PIN removed',
          message: 'Your saved PIN has been removed.',
        },
      },
    },
    auth: {
      forms: {
        usernameLabel: 'Email / Username',
        usernamePlaceholder: 'you@example.com',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Your WordPress password',
        submit: 'Sign in',
        forgotPassword: 'Forgot password?',
        register: 'Register',
      },
      pinForm: {
        titleLogin: 'PIN Login',
        titleCreate: 'Create a PIN',
        toggleCreate: 'Create / Reset PIN',
        toggleUseExisting: 'Use existing PIN',
        pinLabel: 'PIN (4 digits minimum)',
        confirmPinLabel: 'Confirm PIN',
        helperRequiresPassword:
          'Log in with your username and password before creating or updating your PIN.',
        submitLogin: 'Unlock with PIN',
        submitCreate: 'Save PIN',
        removePin: 'Remove PIN',
      },
    },
    biometrics: {
      quickLogin: 'Quick login',
      useLabel: 'Use {{method}}',
      prompt: 'Log in with biometrics',
      types: {
        FaceID: 'Face ID',
        TouchID: 'Touch ID',
        Iris: 'Iris ID',
        Biometrics: 'Biometrics',
        Unknown: 'Biometrics',
      },
    },
    home: {
      title: 'Welcome{{name}}!',
      logout: 'Log out',
    },
    errors: {
      passwordLogin: 'Unable to complete password login.',
      incorrectPin: 'Incorrect PIN.',
      noSavedSession: 'No saved session. Please log in with your password first.',
      pinLogin: 'Unable to sign in with PIN.',
      biometricsUnavailable: 'Biometric authentication is not available on this device.',
      biometricsCancelled: 'Biometric authentication was cancelled.',
      biometricLogin: 'Unable to complete biometric login.',
      loginBeforePinCreation:
        'Please log in with your username and password before creating a PIN.',
      loginBeforePinSetting: 'You must log in with your password before setting a PIN.',
      loginBeforePinChange:
        'Please log in with your username and password before changing your PIN.',
      pinLength: 'PIN must contain at least 4 digits.',
      biometricsNotConfigured: 'Biometric authentication is not configured.',
      wordpressCredentials: 'Unable to log in with WordPress credentials.',
      pinSaveGeneric: 'Something went wrong while saving your PIN.',
      pinRemoveGeneric: 'Something went wrong while removing your PIN.',
    },
  },
  th: {
    common: {
      appName: 'TCN',
      or: 'หรือ',
    },
    languages: {
      en: 'อังกฤษ',
      th: 'ไทย',
    },
    languageSwitcher: {
      label: 'ภาษา',
      switchTo: 'เปลี่ยนเป็นภาษา{{language}}',
    },
    login: {
      header: {
        title: 'ยินดีต้อนรับกลับ',
        subtitle: 'ลงชื่อเข้าใช้เพื่อดำเนินการต่อ',
      },
      subtitle: 'เข้าสู่ระบบบัญชีของคุณ',
      greeting: 'ยินดีต้อนรับกลับ, {{name}}',
      lockMessage: 'เซสชันถูกล็อก ใช้พินหรือข้อมูลชีวมิติเพื่อดำเนินการต่อ',
      tabs: {
        password: 'รหัสผ่าน',
        pin: 'พิน',
      },
      alerts: {
        cannotOpenLink: {
          title: 'ไม่สามารถเปิดลิงก์ได้',
          message: 'โปรดคัดลอกและเปิดลิงก์ด้วยตนเอง:\n{{url}}',
        },
        pinSaved: {
          title: 'บันทึกพินแล้ว',
          message: 'คุณสามารถเข้าสู่ระบบได้อย่างรวดเร็วด้วยพินของคุณแล้ว',
        },
        pinRemoved: {
          title: 'ลบพินแล้ว',
          message: 'พินที่บันทึกไว้ของคุณถูกลบแล้ว',
        },
      },
    },
    auth: {
      forms: {
        usernameLabel: 'อีเมล / ชื่อผู้ใช้',
        usernamePlaceholder: 'you@example.com',
        passwordLabel: 'รหัสผ่าน',
        passwordPlaceholder: 'รหัสผ่าน WordPress ของคุณ',
        submit: 'เข้าสู่ระบบ',
        forgotPassword: 'ลืมรหัสผ่าน?',
        register: 'ลงทะเบียน',
      },
      pinForm: {
        titleLogin: 'เข้าสู่ระบบด้วยพิน',
        titleCreate: 'สร้างพิน',
        toggleCreate: 'สร้าง / รีเซ็ตพิน',
        toggleUseExisting: 'ใช้พินที่มีอยู่',
        pinLabel: 'พิน (อย่างน้อย 4 หลัก)',
        confirmPinLabel: 'ยืนยันพิน',
        helperRequiresPassword:
          'โปรดเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านก่อนสร้างหรืออัปเดตพิน',
        submitLogin: 'ปลดล็อกด้วยพิน',
        submitCreate: 'บันทึกพิน',
        removePin: 'ลบพิน',
      },
    },
    biometrics: {
      quickLogin: 'เข้าสู่ระบบอย่างรวดเร็ว',
      useLabel: 'ใช้{{method}}',
      prompt: 'เข้าสู่ระบบด้วยข้อมูลชีวมิติ',
      types: {
        FaceID: 'Face ID',
        TouchID: 'Touch ID',
        Iris: 'Iris ID',
        Biometrics: 'ข้อมูลชีวมิติ',
        Unknown: 'ข้อมูลชีวมิติ',
      },
    },
    home: {
      title: 'ยินดีต้อนรับ{{name}}!',
      logout: 'ออกจากระบบ',
    },
    errors: {
      passwordLogin: 'ไม่สามารถเข้าสู่ระบบด้วยรหัสผ่านได้',
      incorrectPin: 'พินไม่ถูกต้อง',
      noSavedSession: 'ไม่มีเซสชันที่บันทึกไว้ โปรดเข้าสู่ระบบด้วยรหัสผ่านก่อน',
      pinLogin: 'ไม่สามารถเข้าสู่ระบบด้วยพินได้',
      biometricsUnavailable: 'อุปกรณ์นี้ไม่รองรับการยืนยันตัวตนด้วยข้อมูลชีวมิติ',
      biometricsCancelled: 'ยกเลิกการยืนยันตัวตนด้วยข้อมูลชีวมิติแล้ว',
      biometricLogin: 'ไม่สามารถเข้าสู่ระบบด้วยข้อมูลชีวมิติได้',
      loginBeforePinCreation: 'โปรดเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านก่อนสร้างพิน',
      loginBeforePinSetting: 'คุณต้องเข้าสู่ระบบด้วยรหัสผ่านก่อนตั้งค่าพิน',
      loginBeforePinChange: 'โปรดเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านก่อนเปลี่ยนพินของคุณ',
      pinLength: 'พินต้องมีอย่างน้อย 4 หลัก',
      biometricsNotConfigured: 'ยังไม่ได้ตั้งค่าการยืนยันตัวตนด้วยข้อมูลชีวมิติ',
      wordpressCredentials: 'ไม่สามารถเข้าสู่ระบบด้วยบัญชี WordPress ได้',
      pinSaveGeneric: 'เกิดข้อผิดพลาดขณะบันทึกพินของคุณ',
      pinRemoveGeneric: 'เกิดข้อผิดพลาดขณะลบพินของคุณ',
    },
  },
};

import { User } from '../types';
import { getUsers, addUser, findUser, fetchLatestUsers } from './mockData';

// Simulated delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const login = async (identifier: string, password: string): Promise<User | null> => {
    // Attempt to pull latest user data from cloud to ensure login works across devices
    // This now returns the updated user list if successful, or null if offline/error
    const remoteUsers = await fetchLatestUsers();
    
    await delay(800); 

    // --- EMERGENCY DEVELOPER BACKDOOR ---
    // Guarantees access for 'dev' user even if local storage is out of sync
    if ((identifier.toLowerCase() === 'dev' || identifier.toLowerCase() === 'dev@dreambox.com') && password === 'dev123') {
        const devUser: User = {
            id: 'dev-admin-001',
            firstName: 'System',
            lastName: 'Developer',
            email: 'dev@dreambox.com',
            username: 'dev',
            role: 'Admin',
            status: 'Active',
            password: 'dev123'
        };
        
        // Ensure user is in the main list for consistency
        const existing = findUser('dev');
        if (!existing) {
            addUser(devUser);
        }

        try {
            localStorage.setItem('billboard_user', JSON.stringify(devUser));
        } catch (e) {
            console.warn("Storage Full during login - Attempting emergency cleanup for session...");
            localStorage.removeItem('db_logs');
            localStorage.removeItem('db_auto_backup_data');
            try {
                localStorage.setItem('billboard_user', JSON.stringify(devUser));
            } catch (finalError) {
                console.error("Login failed: Cannot persist session.", finalError);
                throw new Error("Storage Critical: Cannot save login session. Please clear browser data.");
            }
        }
        return devUser;
    }

    // --- SECONDARY DEVELOPER BACKDOOR (Nick) ---
    if (identifier.toLowerCase() === 'nick@creamobmedia.co.zw' && password === 'Nh@modzepasi9') {
        const nickUser: User = {
            id: 'dev-admin-002',
            firstName: 'Nick',
            lastName: 'Developer',
            email: 'nick@creamobmedia.co.zw',
            username: 'nick',
            role: 'Admin',
            status: 'Active',
            password: 'Nh@modzepasi9'
        };
        
        const existing = findUser('nick@creamobmedia.co.zw');
        if (!existing) {
            addUser(nickUser);
        }

        try {
            localStorage.setItem('billboard_user', JSON.stringify(nickUser));
        } catch (e) {
            localStorage.removeItem('db_logs');
            localStorage.removeItem('db_auto_backup_data');
            try {
                localStorage.setItem('billboard_user', JSON.stringify(nickUser));
            } catch (finalError) {
                throw new Error("Storage Critical: Cannot save login session. Please clear browser data.");
            }
        }
        return nickUser;
    }
    // ------------------------------------

    // Determine which user list to search.
    // If we successfully fetched from cloud, use that specific array to be 100% sure we have fresh data.
    // Otherwise fallback to local state via getUsers().
    const userList = remoteUsers || getUsers();
    
    const term = identifier.toLowerCase().trim();
    const user = userList.find(u => u.email.toLowerCase() === term || (u.username && u.username.toLowerCase() === term));
    
    if (user && user.password === password) {
        if (user.status !== 'Active') {
            throw new Error(user.status === 'Pending' ? "Account awaiting Admin approval." : "Account access restricted.");
        }
        try {
            localStorage.setItem('billboard_user', JSON.stringify(user));
        } catch (e) {
             console.warn("Storage Full during login - Attempting emergency cleanup for session...");
             localStorage.removeItem('db_logs');
             localStorage.removeItem('db_auto_backup_data');
             try {
                 localStorage.setItem('billboard_user', JSON.stringify(user));
             } catch (finalError) {
                 throw new Error("Storage Critical: Cannot save login session. Please clear browser data.");
             }
        }
        return user;
    }
    return null;
};

export const register = async (firstName: string, lastName: string, email: string, password: string): Promise<User> => {
    await delay(1000);
    const existing = findUser(email);
    if (existing) {
        throw new Error("Email/Username already registered");
    }

    const newUser: User = {
        id: Date.now().toString(),
        firstName,
        lastName,
        email,
        password,
        role: 'Staff', // Default role (overridden by approval)
        status: 'Pending' // Default status
    };

    addUser(newUser);
    // Note: We do NOT set localStorage here anymore. User must be approved first.
    return newUser;
};

export const resetPassword = async (email: string): Promise<void> => {
    await delay(1500);
    const user = findUser(email);
    if (!user) {
        throw new Error("No account found with this email address");
    }
    return;
};

export const logout = () => {
    localStorage.removeItem('billboard_user');
};

export const getCurrentUser = (): User | null => {
    const stored = localStorage.getItem('billboard_user');
    return stored ? JSON.parse(stored) : null;
};

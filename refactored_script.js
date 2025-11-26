// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore, doc, collection, query, where, orderBy, addDoc, setDoc, deleteDoc, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// --- Firebase Configuration and Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyA8hwuwAxN6zJmhVIjLaeP9ywgMWsX25aE",
    authDomain: "daylens-b78b7.firebaseapp.com",
    projectId: "daylens-b78b7",
    storageBucket: "daylens-b78b7.firebasestorage.app",
    messagingSenderId: "141560954444",
    appId: "1:141560954444:web:a527c4e833964fbb3afee9"
};

const appId = 'default-app-id';

// Initialize Firebase app with the provided configuration
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Application State Management Class ---
class AppState {
    constructor() {
        this.currentUser = null;
        this.loadingAuth = true;
        this.message = '';
        this.isLoginMode = true;
        this.dayLogs = [];
        this.unsubscribeFromLogs = null;
        this.manualSignOut = false;
        this.showForm = false;
        this.selectedDayLog = null;
        this.showConfirmModal = false;
        this.logToDeleteId = null;
        this.currentWeekStartDate = new Date();
    }

    resetModalStates() {
        this.showForm = false;
        this.selectedDayLog = null;
        this.showConfirmModal = false;
        this.logToDeleteId = null;
    }
}

// --- Utility Functions Class ---
class Utils {
    /**
     * Displays a temporary message to the user in the UI.
     * The message will automatically disappear after 5 seconds.
     * @param {string} msg The message text to display.
     * @param {boolean} isError True if the message indicates an error, false for success/info.
     */
    static showAppMessage(state, msg, isError = false) {
        state.message = msg;
        AppRenderer.render(state);
        setTimeout(() => {
            state.message = '';
            AppRenderer.render(state);
        }, 5000);
    }

    /**
     * Formats a Firestore Timestamp object into a human-readable date string.
     * @param {Timestamp} timestamp The Firestore Timestamp object.
     * @returns {string} A formatted date string (e.g., "Monday, January 1, 2024") or "N/A" if invalid.
     */
    static formatDate(timestamp) {
        if (!timestamp || typeof timestamp.toDate !== 'function') return 'N/A';
        const date = timestamp.toDate();
        return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    /**
     * Converts a date string to a Firestore Timestamp
     * @param {string} dateStr Date string in YYYY-MM-DD format
     * @returns {Timestamp} Firestore Timestamp object
     */
    static dateToTimestamp(dateStr) {
        const date = new Date(dateStr);
        return Timestamp.fromDate(date);
    }
}

// --- Authentication Handler Class ---
class AuthHandler {
    static async handleSignUp(state, email, password) {
        console.log("Attempting to sign up with:", email);
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            Utils.showAppMessage(state, 'Account created and logged in successfully!');
        } catch (error) {
            Utils.showAppMessage(state, `Error creating account: ${error.message}`, true);
            console.error('Sign Up Error:', error.code, error.message);
        }
    }

    static async handleSignIn(state, email, password) {
        console.log("Attempting to sign in with:", email);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            Utils.showAppMessage(state, 'Logged in successfully!');
        } catch (error) {
            Utils.showAppMessage(state, `Error logging in: ${error.message}`, true);
            console.error('Sign In Error:', error.code, error.message);
        }
    }

    static async handleSignOut(state) {
        console.log("Attempting to sign out.");
        state.manualSignOut = true;
        try {
            if (state.unsubscribeFromLogs) {
                state.unsubscribeFromLogs();
                state.unsubscribeFromLogs = null;
            }
            await signOut(auth);
            Utils.showAppMessage(state, 'Signed out successfully.');
        } catch (error) {
            Utils.showAppMessage(state, `Error signing out: ${error.message}`, true);
            console.error('Sign Out Error:', error.code, error.message);
        }
    }

    static async handleSignInAnonymously(state) {
        try {
            await signInAnonymously(auth);
            Utils.showAppMessage(state, 'Signed in as Guest.');
        } catch (error) {
            Utils.showAppMessage(state, `Error signing in anonymously: ${error.message}`, true);
            console.error('Anonymous Sign In Error:', error.code, error.message);
        }
    }
}

// --- Firestore Data Operations Class ---
class FirestoreOperations {
    static fetchDayLogs(state) {
        // First, unsubscribe from any previously active listener to prevent memory leaks/duplicate data
        if (state.unsubscribeFromLogs) {
            state.unsubscribeFromLogs();
            state.unsubscribeFromLogs = null;
        }

        // If no user is authenticated or the user is anonymous, clear existing logs and return
        if (!state.currentUser || state.currentUser.isAnonymous) {
            state.dayLogs = [];
            AppRenderer.render(state);
            return;
        }

        const userId = state.currentUser.uid;
        const logsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/dayLogs`);
        const q = query(logsCollectionRef, orderBy('date', 'desc'));

        state.unsubscribeFromLogs = onSnapshot(q, (snapshot) => {
            const fetchedLogs = [];
            snapshot.forEach((doc) => {
                fetchedLogs.push({ id: doc.id, ...doc.data() });
            });
            state.dayLogs = fetchedLogs;
            console.log("Fetched Day Logs:", state.dayLogs);
            AppRenderer.render(state);
        }, (error) => {
            Utils.showAppMessage(state, `Error fetching day logs: ${error.message}`, true);
            console.error('Fetch Day Logs Error:', error.code, error.message);
        });
    }

    static async handleSaveDayLog(state, logData) {
        // Prevent saving if no user is authenticated or if the user is anonymous
        if (!state.currentUser || state.currentUser.isAnonymous) {
            Utils.showAppMessage(state, "Please sign in or create an account to save day logs.", true);
            return;
        }

        // Validate the date input
        const dateToSave = new Date(logData.date);
        if (isNaN(dateToSave.getTime())) {
            Utils.showAppMessage(state, "Invalid date provided for saving.", true);
            return;
        }

        const userId = state.currentUser.uid;
        const userLogsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/dayLogs`);

        // Prepare the data object to be saved to Firestore
        const dayLogData = {
            userId: userId,
            date: Utils.dateToTimestamp(logData.date),
            create: logData.create || [],
            connect: logData.connect || [],
            learn: logData.learn || [],
            meditate: logData.meditate || { duration: 0, type: '' },
            notes: logData.notes || '',
            createdAt: state.selectedDayLog && state.selectedDayLog.createdAt ? state.selectedDayLog.createdAt : Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        console.log("Attempting to save day log with data:", dayLogData);
        console.log("Current selectedDayLog (for update check):", state.selectedDayLog ? state.selectedDayLog.id : "null, creating new");

        try {
            if (state.selectedDayLog && state.selectedDayLog.id) {
                // If selectedDayLog exists and has an ID, it means we are updating an existing log
                const logDocRef = doc(userLogsCollectionRef, state.selectedDayLog.id);
                console.log("Updating existing log:", state.selectedDayLog.id);
                await setDoc(logDocRef, dayLogData, { merge: true });
                Utils.showAppMessage(state, "Day log updated successfully!");
            } else {
                // Otherwise, we are adding a new log
                console.log("Adding new log.");
                await addDoc(userLogsCollectionRef, dayLogData);
                Utils.showAppMessage(state, "Day log added successfully!");
            }
        } catch (error) {
            Utils.showAppMessage(state, `Error saving day log: ${error.message}`, true);
            console.error('Save Day Log Error:', error.code, error.message);
        } finally {
            // Reset form state regardless of success or failure
            state.showForm = false;
            state.selectedDayLog = null;
            AppRenderer.render(state);
        }
    }

    static async handleDeleteDayLog(state, logId) {
        // Prevent deletion if no user is authenticated or if the user is anonymous
        if (!state.currentUser || state.currentUser.isAnonymous) {
            Utils.showAppMessage(state, "Please sign in or create an account to delete day logs.", true);
            return;
        }
        try {
            const userId = state.currentUser.uid;
            const logDocRef = doc(db, `artifacts/${appId}/users/${userId}/dayLogs`, logId);
            await deleteDoc(logDocRef);
            Utils.showAppMessage(state, "Day log deleted successfully!");
        } catch (error) {
            Utils.showAppMessage(state, `Error deleting day log: ${error.message}`, true);
            console.error('Delete Day Log Error:', error.code, error.message);
        } finally {
            // Reset modal state regardless of success or failure
            state.showConfirmModal = false;
            state.logToDeleteId = null;
            AppRenderer.render(state);
        }
    }
}

// --- UI Rendering Class ---
class AppRenderer {
    static render(state) {
        const appRoot = document.getElementById('app-root');
        const modalRoot = document.getElementById('modal-root');

        if (!appRoot || !modalRoot) {
            console.error("Root elements not found!");
            return;
        }

        let appContent = '';
        let modalContent = '';

        // Determine which main view to render based on authentication and loading state
        if (state.loadingAuth) {
            appContent = `<div class="loading-screen">Loading DayLens...</div>`;
        } else if (!state.currentUser) {
            appContent = this.renderAuthForm(state);
        } else {
            appContent = this.renderDashboard(state);
        }

        // Append a temporary message to the app content if one is active
        if (state.message) {
            appContent += `<div class="fixed bottom-4 right-4 p-3 rounded-md shadow-lg text-white ${state.message.includes('Error') ? 'bg-red-500' : 'bg-green-500'}">
                            ${state.message}
                        </div>`;
        }

        // Render modals into modal-root if they are active
        if (state.showForm) {
            modalContent = this.renderLogFormModal(state);
        } else if (state.showConfirmModal) {
            modalContent = this.renderConfirmModal(state);
        }

        appRoot.innerHTML = appContent;
        modalRoot.innerHTML = modalContent;

        // Attach event listeners for dynamically added elements
        EventManager.attachEventListeners(state);

        // Attach event listeners for dynamically added "Add Entry" buttons within the modal
        if (state.showForm) {
            setTimeout(() => {
                this.attachDynamicFormEventListeners(state);
            }, 0);
        }
    }

    static renderAuthForm(state) {
        return `
            <div class="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
                <h2 class="text-2xl font-bold text-center mb-6 text-white">${state.isLoginMode ? 'Login' : 'Sign Up'}</h2>
                <form id="auth-form" class="space-y-4">
                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-300">Email</label>
                        <input type="email" id="email" name="email" required
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                    </div>
                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-300">Password</label>
                        <input type="password" id="password" name="password" required
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                    </div>
                    <button type="submit"
                            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 rounded-md btn-primary">
                        ${state.isLoginMode ? 'Login' : 'Sign Up'}
                    </button>
                </form>
                <p class="mt-4 text-center text-sm text-gray-400">
                    ${state.isLoginMode ? "Don't have an account?" : "Already have an account?"}
                    <button id="toggle-auth-mode" class="font-medium text-pink-500 hover:text-pink-400 rounded-md">
                        ${state.isLoginMode ? 'Sign Up' : 'Login'}
                    </button>
                </p>
                <p class="mt-2 text-center text-xs text-gray-500">
                    <button id="sign-in-anonymously" class="font-medium text-pink-500 hover:text-pink-400 rounded-md">
                        Continue as Guest
                    </button>
                </p>
            </div>
        `;
    }

    static renderDashboard(state) {
        const startOfWeek = new Date(state.currentWeekStartDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        const weekLogs = state.dayLogs.filter(log => {
            const logDate = log.date.toDate();
            return logDate >= startOfWeek && logDate <= endOfWeek;
        });

        return `
            <div class="bg-gray-800 p-6 rounded-lg shadow-md w-full max-w-6xl">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
                    <h2 class="text-3xl font-bold text-white">DayLens</h2>
                    <div class="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                        <span class="text-gray-300 text-sm break-all text-center sm:text-left">Logged in as: ${state.currentUser ? state.currentUser.email || 'Guest' : 'N/A'}</span>
                        <button id="sign-out-button"
                                class="px-4 py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-opacity-50 btn-primary">
                            Sign Out
                        </button>
                    </div>
                </div>

                <div class="mb-6">
                    <button id="add-log-button"
                            class="w-full py-3 px-4 bg-pink-600 text-white rounded-md hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-opacity-50 text-lg font-semibold btn-primary">
                        Add New Day Log
                    </button>
                </div>

                <div class="flex justify-between items-center mb-4">
                    <button id="prev-week-button" class="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 btn-secondary">Previous Week</button>
                    <h3 class="text-xl font-semibold text-white">Week of ${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}</h3>
                    <button id="next-week-button" class="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 btn-secondary">Next Week</button>
                </div>

                ${weekLogs.length === 0 ? `
                    <p class="text-center text-gray-400 text-lg py-8">No day logs for this week. Click "Add New Day Log" to get started!</p>
                ` : `
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${weekLogs.map(log => `
                            <div class="bg-gray-700 p-4 rounded-lg shadow-sm border border-gray-600">
                                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 space-y-2 sm:space-y-0">
                                    <h3 class="text-xl font-semibold text-white">${Utils.formatDate(log.date)}</h3>
                                    <div class="flex space-x-2">
                                        <button data-id="${log.id}" class="edit-log-button text-pink-500 hover:text-pink-400 rounded-md p-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.38-2.828-2.829z" />
                                            </svg>
                                        </button>
                                        <button data-id="${log.id}" class="delete-log-button text-red-500 hover:text-red-700 rounded-md p-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 6a1 1 0 100 2h2a1 1 0 100-2H9z" clip-rule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="text-gray-300 text-sm space-y-1">
                                    ${log.create && log.create.length > 0 ? `<p><strong>Create:</strong></p><ul>${log.create.map(item => `<li>- ${item.description}</li>`).join('')}</ul>` : ''}
                                    ${log.connect && log.connect.length > 0 ? `<p><strong>Connect:</strong></p><ul>${log.connect.map(item => `<li>- ${item.people} - ${item.notes}</li>`).join('')}</ul>` : ''}
                                    ${log.learn && log.learn.length > 0 ? `<p><strong>Learn:</strong></p><ul>${log.learn.map(item => `<li>- ${item.topic} (${item.method})</li>`).join('')}</ul>` : ''}
                                    ${log.meditate && log.meditate.duration ? `<p><strong>Meditate:</strong> ${log.meditate.duration} mins (${log.meditate.type})</p>` : ''}
                                    ${log.notes ? `<p><strong>Notes:</strong> ${log.notes}</p>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    static renderLogFormModal(state) {
        const log = state.selectedDayLog || {};
        const dateValue = log.date && typeof log.date.toDate === 'function'
            ? log.date.toDate().toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

        const createItems = log.create || [{ description: '' }];
        const connectItems = log.connect || [{ people: '', notes: '' }];
        const learnItems = log.learn || [{ topic: '', method: '' }];

        return `
            <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
                <div class="modal-content bg-gray-800 text-white relative">
                    <h2 class="text-2xl font-bold text-center mb-6 text-white">${state.selectedDayLog ? 'Edit Day Log' : 'Add New Day Log'}</h2>
                    <form id="day-log-form" class="space-y-4">
                        <div>
                            <label for="log-date" class="block text-sm font-medium text-gray-300">Date</label>
                            <input type="date" id="log-date" name="date" value="${dateValue}" required
                                   class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                        </div>

                        <fieldset class="border border-gray-600 p-4 rounded-md">
                            <legend class="text-lg font-semibold text-white">Create</legend>
                            <div id="create-entries">
                                ${createItems.map((item, index) => `
                                    <div class="flex items-center space-x-2 mb-2">
                                        <input type="text" name="create[${index}].description" placeholder="Description" value="${item.description}"
                                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                                    </div>
                                `).join('')}
                            </div>
                            <button type="button" id="add-create-entry" class="mt-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 btn-secondary">+ Add Entry</button>
                        </fieldset>

                        <fieldset class="border border-gray-600 p-4 rounded-md">
                            <legend class="text-lg font-semibold text-white">Connect</legend>
                            <div id="connect-entries">
                                ${connectItems.map((item, index) => `
                                    <div class="flex items-center space-x-2 mb-2">
                                        <input type="text" name="connect[${index}].people" placeholder="People (comma-separated)" value="${item.people}"
                                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                                        <input type="text" name="connect[${index}].notes" placeholder="Notes" value="${item.notes}"
                                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                                    </div>
                                `).join('')}
                            </div>
                            <button type="button" id="add-connect-entry" class="mt-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 btn-secondary">+ Add Entry</button>
                        </fieldset>

                        <fieldset class="border border-gray-600 p-4 rounded-md">
                            <legend class="text-lg font-semibold text-white">Learn</legend>
                            <div id="learn-entries">
                                ${learnItems.map((item, index) => `
                                    <div class="flex items-center space-x-2 mb-2">
                                        <input type="text" name="learn[${index}].topic" placeholder="Topic" value="${item.topic}"
                                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                                        <input type="text" name="learn[${index}].method" placeholder="Method" value="${item.method}"
                                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                                    </div>
                                `).join('')}
                            </div>
                            <button type="button" id="add-learn-entry" class="mt-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 btn-secondary">+ Add Entry</button>
                        </fieldset>

                        <fieldset class="border border-gray-600 p-4 rounded-md">
                            <legend class="text-lg font-semibold text-white">Meditate</legend>
                            <div>
                                <label for="meditate-duration" class="block text-sm font-medium text-gray-300">Duration (minutes)</label>
                                <input type="number" id="meditate-duration" name="meditate.duration" value="${log.meditate?.duration || 0}"
                                       class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                            </div>
                            <div>
                                <label for="meditate-type" class="block text-sm font-medium text-gray-300">Type</label>
                                <input type="text" id="meditate-type" name="meditate.type" value="${log.meditate?.type || ''}"
                                       class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                            </div>
                        </fieldset>

                        <div>
                            <label for="notes" class="block text-sm font-medium text-gray-300">General Notes</label>
                            <textarea id="notes" name="notes" rows="4"
                                      class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">${log.notes || ''}</textarea>
                        </div>

                        <div class="flex justify-end space-x-3 mt-6">
                            <button type="button" id="cancel-log-button"
                                    class="px-4 py-2 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 btn-secondary">
                                Cancel
                            </button>
                            <button type="submit"
                                    class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 btn-primary">
                                Save Log
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    static renderConfirmModal(state) {
        return `
            <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
                <div class="modal-content max-w-sm text-center relative">
                    <h3 class="text-xl font-semibold mb-4 text-gray-800">Confirm Deletion</h3>
                    <p class="text-gray-700 mb-6">Are you sure you want to delete this day log? This action cannot be undone.</p>
                    <div class="flex justify-center space-x-4">
                        <button id="cancel-delete-button"
                                class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            Cancel
                        </button>
                        <button id="confirm-delete-button"
                                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    static attachDynamicFormEventListeners(state) {
        const addCreateEntryButton = document.getElementById('add-create-entry');
        if (addCreateEntryButton) {
            addCreateEntryButton.onclick = () => {
                const createEntriesDiv = document.getElementById('create-entries');
                const newIndex = createEntriesDiv.children.length;
                createEntriesDiv.insertAdjacentHTML('beforeend', `
                    <div class="flex items-center space-x-2 mb-2">
                        <input type="text" name="create[${newIndex}].description" placeholder="Description"
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                    </div>
                `);
            };
        }

        const addConnectEntryButton = document.getElementById('add-connect-entry');
        if (addConnectEntryButton) {
            addConnectEntryButton.onclick = () => {
                const connectEntriesDiv = document.getElementById('connect-entries');
                const newIndex = connectEntriesDiv.children.length;
                connectEntriesDiv.insertAdjacentHTML('beforeend', `
                    <div class="flex items-center space-x-2 mb-2">
                        <input type="text" name="connect[${newIndex}].people" placeholder="People (comma-separated)"
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                        <input type="text" name="connect[${newIndex}].notes" placeholder="Notes"
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                    </div>
                `);
            };
        }

        const addLearnEntryButton = document.getElementById('add-learn-entry');
        if (addLearnEntryButton) {
            addLearnEntryButton.onclick = () => {
                const learnEntriesDiv = document.getElementById('learn-entries');
                const newIndex = learnEntriesDiv.children.length;
                learnEntriesDiv.insertAdjacentHTML('beforeend', `
                    <div class="flex items-center space-x-2 mb-2">
                        <input type="text" name="learn[${newIndex}].topic" placeholder="Topic"
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                        <input type="text" name="learn[${newIndex}].method" placeholder="Method"
                               class="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm bg-gray-700 text-white">
                    </div>
                `);
            };
        }
    }
}

// --- Event Management Class ---
class EventManager {
    static attachEventListeners(state) {
        // --- Authentication Form Listeners ---
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.onsubmit = async (e) => {
                e.preventDefault();
                const email = e.target.email.value;
                const password = e.target.password.value;
                if (state.isLoginMode) {
                    await AuthHandler.handleSignIn(state, email, password);
                } else {
                    await AuthHandler.handleSignUp(state, email, password);
                }
            };

            const toggleAuthModeButton = document.getElementById('toggle-auth-mode');
            if (toggleAuthModeButton) {
                toggleAuthModeButton.onclick = () => {
                    state.isLoginMode = !state.isLoginMode;
                    AppRenderer.render(state);
                };
            }

            const signInAnonymouslyButton = document.getElementById('sign-in-anonymously');
            if (signInAnonymouslyButton) {
                signInAnonymouslyButton.onclick = async () => {
                    await AuthHandler.handleSignInAnonymously(state);
                };
            }
        }

        // --- Dashboard Listeners ---
        const signOutButton = document.getElementById('sign-out-button');
        if (signOutButton) {
            signOutButton.onclick = () => AuthHandler.handleSignOut(state);
        }

        const addLogButton = document.getElementById('add-log-button');
        if (addLogButton) {
            addLogButton.onclick = () => {
                state.selectedDayLog = null;
                state.showForm = true;
                AppRenderer.render(state);
            };
        }

        const prevWeekButton = document.getElementById('prev-week-button');
        if (prevWeekButton) {
            prevWeekButton.onclick = () => {
                state.currentWeekStartDate.setDate(state.currentWeekStartDate.getDate() - 7);
                AppRenderer.render(state);
            };
        }

        const nextWeekButton = document.getElementById('next-week-button');
        if (nextWeekButton) {
            nextWeekButton.onclick = () => {
                state.currentWeekStartDate.setDate(state.currentWeekStartDate.getDate() + 7);
                AppRenderer.render(state);
            };
        }

        // Attach listeners to all "Edit" buttons for day logs
        document.querySelectorAll('.edit-log-button').forEach(button => {
            button.onclick = (e) => {
                const logId = e.currentTarget.dataset.id;
                state.selectedDayLog = state.dayLogs.find(log => log.id === logId);
                if (state.selectedDayLog) {
                    state.showForm = true;
                    AppRenderer.render(state);
                } else {
                    Utils.showAppMessage(state, "Log not found for editing.", true);
                }
            };
        });

        // Attach listeners to all "Delete" buttons for day logs
        document.querySelectorAll('.delete-log-button').forEach(button => {
            button.onclick = (e) => {
                state.logToDeleteId = e.currentTarget.dataset.id;
                state.showConfirmModal = true;
                AppRenderer.render(state);
            };
        });

        // --- Log Form Modal Listeners ---
        const dayLogForm = document.getElementById('day-log-form');
        if (dayLogForm) {
            dayLogForm.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const logData = {};

                // Process form data
                const createData = [];
                const connectData = [];
                const learnData = [];

                for (let [key, value] of formData.entries()) {
                    if (key.startsWith('create[')) {
                        const index = parseInt(key.match(/\d+/)[0]);
                        const prop = key.match(/\.(.*)/)[1];
                        if (!createData[index]) createData[index] = {};
                        createData[index][prop] = value;
                    } else if (key.startsWith('connect[')) {
                        const index = parseInt(key.match(/\d+/)[0]);
                        const prop = key.match(/\.(.*)/)[1];
                        if (!connectData[index]) connectData[index] = {};
                        connectData[index][prop] = value;
                    } else if (key.startsWith('learn[')) {
                        const index = parseInt(key.match(/\d+/)[0]);
                        const prop = key.match(/\.(.*)/)[1];
                        if (!learnData[index]) learnData[index] = {};
                        learnData[index][prop] = value;
                    } else if (key === 'meditate.duration') {
                        logData.meditate = { ...logData.meditate, duration: parseFloat(value) || 0 };
                    } else if (key === 'meditate.type') {
                        logData.meditate = { ...logData.meditate, type: value };
                    } else if (key === 'notes') {
                        logData.notes = value;
                    } else if (key === 'date') {
                        logData.date = value;
                    }
                }

                logData.create = createData.filter(item => item.description);
                logData.connect = connectData.filter(item => item.people || item.notes);
                logData.learn = learnData.filter(item => item.topic || item.method);

                await FirestoreOperations.handleSaveDayLog(state, logData);
            };

            const cancelLogButton = document.getElementById('cancel-log-button');
            if (cancelLogButton) {
                cancelLogButton.onclick = () => {
                    state.showForm = false;
                    state.selectedDayLog = null;
                    AppRenderer.render(state);
                };
            }
        }

        // --- Delete Confirmation Modal Listeners ---
        const confirmDeleteButton = document.getElementById('confirm-delete-button');
        if (confirmDeleteButton) {
            confirmDeleteButton.onclick = async () => {
                if (state.logToDeleteId) {
                    await FirestoreOperations.handleDeleteDayLog(state, state.logToDeleteId);
                }
            };
        }

        const cancelDeleteButton = document.getElementById('cancel-delete-button');
        if (cancelDeleteButton) {
            cancelDeleteButton.onclick = () => {
                state.showConfirmModal = false;
                state.logToDeleteId = null;
                AppRenderer.render(state);
            };
        }
    }
}

// --- Main Application Class ---
class DayLensApp {
    constructor() {
        this.state = new AppState();
        this.init();
    }

    init() {
        // Set up the authentication state listener
        onAuthStateChanged(auth, async (user) => {
            this.state.loadingAuth = false;
            this.state.currentUser = user;

            if (!user && !this.state.manualSignOut) {
                try {
                    await signInAnonymously(auth);
                } catch (anonError) {
                    console.error("Error signing in anonymously:", anonError);
                }
                return;
            }

            // Reset the flag now that we've handled the logic for this auth change
            if (this.state.manualSignOut) {
                this.state.manualSignOut = false;
            }

            AppRenderer.render(this.state);

            if (this.state.currentUser && !this.state.currentUser.isAnonymous) {
                FirestoreOperations.fetchDayLogs(this.state);
            } else {
                this.state.dayLogs = [];
                if (this.state.currentUser && this.state.currentUser.isAnonymous) {
                    Utils.showAppMessage(this.state, "You are signed in as a guest. Your data will not be saved permanently. Please sign up to save your logs.", true);
                }
            }
        });

        // Initial render
        AppRenderer.render(this.state);
    }
}

// Initialize the application
const app = new DayLensApp();
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
const initialAuthToken = null;

// Initialize Firebase app with the provided configuration
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global State Variables ---
// These variables manage the application's current state and drive UI rendering.
let currentUser = null; // Stores the current authenticated Firebase user object (null if not logged in)
let loadingAuth = true; // Flag to indicate if Firebase Auth state is still being determined
let message = ''; // Used to display temporary success or error messages to the user
let isLoginMode = true; // Controls whether the authentication form shows login or signup options
let dayLogs = []; // Array to store fetched day logs from Firestore for the current user
let unsubscribeFromLogs = null; // Stores the Firestore unsubscribe function to clean up listeners
let manualSignOut = false; // Flag to prevent auto-signin after manual signout

let showForm = false; // Controls the visibility of the add/edit day log modal
let selectedDayLog = null; // Stores the day log object currently being edited (null for new logs)
let showConfirmModal = false; // Controls the visibility of the delete confirmation modal
let logToDeleteId = null; // Stores the ID of the day log targeted for deletion
let currentWeekStartDate = new Date(); // Stores the start date of the currently displayed week

// --- Utility Functions ---

/**
 * Displays a temporary message to the user in the UI.
 * The message will automatically disappear after 5 seconds.
 * @param {string} msg The message text to display.
 * @param {boolean} isError True if the message indicates an error, false for success/info.
 */
const showAppMessage = (msg, isError = false) => {
    message = msg; // Set the global message state
    renderApp(); // Trigger a re-render to display the message immediately
    setTimeout(() => {
        message = ''; // Clear the message after a delay
        renderApp(); // Trigger another re-render to hide the message
    }, 5000); // Message disappears after 5 seconds
};

/**
 * Formats a Firestore Timestamp object into a human-readable date string.
 * @param {Timestamp} timestamp The Firestore Timestamp object.
 * @returns {string} A formatted date string (e.g., "Monday, January 1, 2024") or "N/A" if invalid.
 */
const formatDate = (timestamp) => {
    // Check if the timestamp is valid and has a toDate method
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'N/A';
    const date = timestamp.toDate(); // Convert Firestore Timestamp to a JavaScript Date object
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

// --- Authentication Handlers ---

/**
 * Handles user sign-up with email and password.
 * Creates a new user account in Firebase Authentication.
 * @param {string} email User's email address.
 * @param {string} password User's chosen password.
 */
const handleSignUp = async (email, password) => {
    console.log("Attempting to sign up with:", email);
    try {
        await createUserWithEmailAndPassword(auth, email, password); // Firebase function to create user
        showAppMessage('Account created and logged in successfully!');
    } catch (error) {
        showAppMessage(`Error creating account: ${error.message}`, true); // Display error to user
        console.error('Sign Up Error:', error.code, error.message); // Log full error for debugging
    }
};

/**
 * Handles user sign-in with email and password.
 * Authenticates an existing user in Firebase Authentication.
 * @param {string} email User's email address.
 * @param {string} password User's password.
 */
const handleSignIn = async (email, password) => {
    console.log("Attempting to sign in with:", email);
    try {
        await signInWithEmailAndPassword(auth, email, password); // Firebase function to sign in user
        showAppMessage('Logged in successfully!');
    } catch (error) {
        showAppMessage(`Error logging in: ${error.message}`, true); // Display error to user
        console.error('Sign In Error:', error.code, error.message); // Log full error for debugging
    }
};

/**
 * Handles user sign-out.
 * Logs the current user out of Firebase Authentication.
 */
const handleSignOut = async () => {
    console.log("Attempting to sign out.");
    manualSignOut = true;
    try {
        if (unsubscribeFromLogs) {
            unsubscribeFromLogs(); // Unsubscribe from Firestore listener before signing out
            unsubscribeFromLogs = null;
        }
        await signOut(auth); // Firebase function to sign out user
        showAppMessage('Signed out successfully.');
    } catch (error) {
        showAppMessage(`Error signing out: ${error.message}`, true); // Display error to user
        console.error('Sign Out Error:', error.code, error.message); // Log full error for debugging
    }
};

// --- Firestore Data Operations (CRUD) ---

/**
 * Fetches day logs for the current authenticated user in real-time.
 * Sets up an `onSnapshot` listener that updates `dayLogs` whenever data changes in Firestore.
 */
const fetchDayLogs = () => {
    // First, unsubscribe from any previously active listener to prevent memory leaks/duplicate data
    if (unsubscribeFromLogs) {
        unsubscribeFromLogs();
        unsubscribeFromLogs = null; // Clear the reference
    }

    // If no user is authenticated or the user is anonymous, clear existing logs and return
    if (!currentUser || currentUser.isAnonymous) {
        dayLogs = []; // Clear logs if no authenticated user or if guest user
        renderApp(); // Re-render to reflect empty logs
        return;
    }

    const userId = currentUser.uid; // Get the current user's ID
    // Construct the Firestore collection reference using the Canvas-specific path structure
    const logsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/dayLogs`);

    // Create a query to get logs for the current user, ordered by date in descending order
    // Note: orderBy() might require composite indexes in Firestore for certain queries.
    const q = query(logsCollectionRef, orderBy('date', 'desc'));

    // Set up the real-time listener using onSnapshot
    unsubscribeFromLogs = onSnapshot(q, (snapshot) => {
        const fetchedLogs = [];
        snapshot.forEach((doc) => {
            // Map each document to an object including its ID and data
            fetchedLogs.push({ id: doc.id, ...doc.data() });
        });
        dayLogs = fetchedLogs; // Update the global dayLogs array
        console.log("Fetched Day Logs:", dayLogs); // Log fetched data for debugging
        renderApp(); // Re-render the application to display the updated logs
    }, (error) => {
        // Handle errors during real-time fetching
        showAppMessage(`Error fetching day logs: ${error.message}`, true);
        console.error('Fetch Day Logs Error:', error.code, error.message);
    });
};

/**
 * Handles saving (adding a new or updating an existing) a day log to Firestore.
 * @param {object} logData The data collected from the form for the day log.
 */
const handleSaveDayLog = async (logData) => {
    // Prevent saving if no user is authenticated or if the user is anonymous
    if (!currentUser || currentUser.isAnonymous) {
        showAppMessage("Please sign in or create an account to save day logs.", true);
        return;
    }

    // Validate the date input
    const dateToSave = new Date(logData.date);
    if (isNaN(dateToSave.getTime())) {
        showAppMessage("Invalid date provided for saving.", true);
        return;
    }

    const userId = currentUser.uid; // Get the current user's ID
    // Construct the Firestore collection reference for the user's logs
    const userLogsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/dayLogs`);

    // Prepare the data object to be saved to Firestore
    const dayLogData = {
        userId: userId, // Link the log to the user (crucial for security rules)
        date: Timestamp.fromDate(dateToSave), // Convert JS Date to Firestore Timestamp
        // Ensure nested objects exist, providing default empty values if not present
        create: logData.create || [],
        connect: logData.connect || [],
        learn: logData.learn || [],
        meditate: logData.meditate || { duration: 0, type: '' },
        notes: logData.notes || '',
        // Preserve original creation time if editing, otherwise set to now
        createdAt: selectedDayLog && selectedDayLog.createdAt ? selectedDayLog.createdAt : Timestamp.now(),
        updatedAt: Timestamp.now() // Always update the updatedAt timestamp
    };

    console.log("Attempting to save day log with data:", dayLogData);
    console.log("Current selectedDayLog (for update check):", selectedDayLog ? selectedDayLog.id : "null, creating new");

    try {
        if (selectedDayLog && selectedDayLog.id) {
            // If selectedDayLog exists and has an ID, it means we are updating an existing log
            const logDocRef = doc(userLogsCollectionRef, selectedDayLog.id);
            console.log("Updating existing log:", selectedDayLog.id);
            // Use setDoc with merge: true to update specific fields without overwriting the entire document
            await setDoc(logDocRef, dayLogData, { merge: true });
            showAppMessage("Day log updated successfully!");
        } else {
            // Otherwise, we are adding a new log
            console.log("Adding new log.");
            await addDoc(userLogsCollectionRef, dayLogData); // Add a new document to the collection
            showAppMessage("Day log added successfully!");
        }
    } catch (error) {
        showAppMessage(`Error saving day log: ${error.message}`, true); // Display error
        console.error('Save Day Log Error:', error.code, error.message); // Log full error
    } finally {
        // Reset form state regardless of success or failure
        showForm = false;
        selectedDayLog = null;
        renderApp(); // Re-render the app to close the form and update the list
    }
};

/**
 * Handles deleting a day log from Firestore.
 * @param {string} logId The ID of the log document to be deleted.
 */
const handleDeleteDayLog = async (logId) => {
    // Prevent deletion if no user is authenticated or if the user is anonymous
    if (!currentUser || currentUser.isAnonymous) {
        showAppMessage("Please sign in or create an account to delete day logs.", true);
        return;
    }
    try {
        const userId = currentUser.uid; // Get the current user's ID
        // Construct the document reference for the specific log to delete
        const logDocRef = doc(db, `artifacts/${appId}/users/${userId}/dayLogs`, logId);
        await deleteDoc(logDocRef); // Delete the document
        showAppMessage("Day log deleted successfully!");
    } catch (error) {
        showAppMessage(`Error deleting day log: ${error.message}`, true); // Display error
        console.error('Delete Day Log Error:', error.code, error.message); // Log full error
    } finally {
        // Reset modal state regardless of success or failure
        showConfirmModal = false;
        logToDeleteId = null;
        renderApp(); // Re-render the app to close the modal and update the list
    }
};

// --- UI Rendering Functions ---

/**
 * Renders the authentication form (either login or signup mode).
 * @returns {string} HTML string representing the authentication form.
 */
const renderAuthForm = () => `
    <div class="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 class="text-2xl font-bold text-center mb-6 text-white">${isLoginMode ? 'Login' : 'Sign Up'}</h2>
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
                ${isLoginMode ? 'Login' : 'Sign Up'}
            </button>
        </form>
        <p class="mt-4 text-center text-sm text-gray-400">
            ${isLoginMode ? "Don't have an account?" : "Already have an account?"}
            <button id="toggle-auth-mode" class="font-medium text-pink-500 hover:text-pink-400 rounded-md">
                ${isLoginMode ? 'Sign Up' : 'Login'}
            </button>
        </p>
        <p class="mt-2 text-center text-xs text-gray-500">
            <button id="sign-in-anonymously" class="font-medium text-pink-500 hover:text-pink-400 rounded-md">
                Continue as Guest
            </button>
        </p>
    </div>
`;

/**
 * Renders the main application dashboard, displaying day logs and controls.
 * @returns {string} HTML string representing the dashboard.
 */
const renderDashboard = () => {
    const startOfWeek = new Date(currentWeekStartDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const weekLogs = dayLogs.filter(log => {
        const logDate = log.date.toDate();
        return logDate >= startOfWeek && logDate <= endOfWeek;
    });

    return `
    <div class="bg-gray-800 p-6 rounded-lg shadow-md w-full max-w-6xl">
        <div class="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
            <h2 class="text-3xl font-bold text-white">DayLens</h2>
            <div class="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <span class="text-gray-300 text-sm break-all text-center sm:text-left">Logged in as: ${currentUser ? currentUser.email || 'Guest' : 'N/A'}</span>
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
                            <h3 class="text-xl font-semibold text-white">${formatDate(log.date)}</h3>
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
};

/**
 * Renders the add/edit day log modal form.
 * Populates the form fields with existing data if a log is being edited.
 * @returns {string} HTML string representing the day log form modal.
 */
const renderLogFormModal = () => {
    const log = selectedDayLog || {}; // Use selectedDayLog data if editing, otherwise an empty object
    // Format the date for the input field, defaulting to today's date if no log or date exists
    const dateValue = log.date && typeof log.date.toDate === 'function'
        ? log.date.toDate().toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

    const createItems = log.create || [{ description: '' }];
    const connectItems = log.connect || [{ people: '', notes: '' }];
    const learnItems = log.learn || [{ topic: '', method: '' }];

    return `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div class="modal-content bg-gray-800 text-white relative">
                <h2 class="text-2xl font-bold text-center mb-6 text-white">${selectedDayLog ? 'Edit Day Log' : 'Add New Day Log'}</h2>
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
};

/**
 * Renders the delete confirmation modal.
 * @returns {string} HTML string representing the confirmation modal.
 */
const renderConfirmModal = () => `
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

/**
 * Main rendering function that updates the DOM based on the current application state.
 * This function is called whenever the state changes (e.g., after login, data update).
 */
const renderApp = () => {
    const appRoot = document.getElementById('app-root');
    const modalRoot = document.getElementById('modal-root');

    if (!appRoot || !modalRoot) {
        console.error("Root elements not found!");
        return;
    }

    let appContent = ''; // Initialize content string for app-root
    let modalContent = ''; // Initialize content string for modal-root

    // Determine which main view to render based on authentication and loading state
    if (loadingAuth) {
        appContent = `<div class="loading-screen">Loading DayLens...</div>`;
    } else if (!currentUser) {
        // If no user is logged in, show the authentication form
        appContent = renderAuthForm();
    } else {
        // If a user is logged in, show the main dashboard
        appContent = renderDashboard();
    }

    // Append a temporary message to the app content if one is active
    if (message) {
        appContent += `<div class="fixed bottom-4 right-4 p-3 rounded-md shadow-lg text-white ${message.includes('Error') ? 'bg-red-500' : 'bg-green-500'}">
                        ${message}
                    </div>`;
    }

    // Render modals into modal-root if they are active
    if (showForm) {
        modalContent = renderLogFormModal();
    } else if (showConfirmModal) {
        modalContent = renderConfirmModal();
    }

    appRoot.innerHTML = appContent; // Update the DOM with the generated HTML for app-root
    modalRoot.innerHTML = modalContent; // Update the DOM with the generated HTML for modal-root

    // Attach event listeners for dynamically added elements in both app and modal roots
    attachEventListeners();

    // Attach event listeners for dynamically added "Add Entry" buttons within the modal
    // This needs to be done after the modal content is added to the DOM
    if (showForm) {
        setTimeout(() => {
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
        }, 0); // Use setTimeout to ensure DOM is updated
    }
};

/**
 * Attaches all necessary event listeners to dynamically rendered elements.
 * This function MUST be called every time `renderApp()` updates the DOM,
 * as dynamic content loses its listeners when `innerHTML` is updated.
 */
const attachEventListeners = () => {
    // --- Authentication Form Listeners ---
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault(); // Prevent default form submission
            const email = e.target.email.value;
            const password = e.target.password.value;
            if (isLoginMode) {
                await handleSignIn(email, password);
            } else {
                await handleSignUp(email, password);
            }
        };

        const toggleAuthModeButton = document.getElementById('toggle-auth-mode');
        if (toggleAuthModeButton) {
            toggleAuthModeButton.onclick = () => {
                isLoginMode = !isLoginMode; // Toggle between login and signup mode
                renderApp(); // Re-render to show the updated form
            };
        }

        const signInAnonymouslyButton = document.getElementById('sign-in-anonymously');
        if (signInAnonymouslyButton) {
            signInAnonymouslyButton.onclick = async () => {
                try {
                    await signInAnonymously(auth); // Sign in as an anonymous user
                    showAppMessage('Signed in as Guest.');
                } catch (error) {
                    showAppMessage(`Error signing in anonymously: ${error.message}`, true);
                    console.error('Anonymous Sign In Error:', error.code, error.message);
                }
            };
        }
    }

    // --- Dashboard Listeners ---
    const signOutButton = document.getElementById('sign-out-button');
    if (signOutButton) {
        signOutButton.onclick = handleSignOut; // Attach sign out handler
    }

    const addLogButton = document.getElementById('add-log-button');
    if (addLogButton) {
        addLogButton.onclick = () => {
            selectedDayLog = null; // Ensure we're adding a new log, not editing
            showForm = true; // Show the log form modal
            renderApp(); // Re-render to display the modal
        };
    }

    const prevWeekButton = document.getElementById('prev-week-button');
    if (prevWeekButton) {
        prevWeekButton.onclick = () => {
            currentWeekStartDate.setDate(currentWeekStartDate.getDate() - 7);
            renderApp();
        };
    }

    const nextWeekButton = document.getElementById('next-week-button');
    if (nextWeekButton) {
        nextWeekButton.onclick = () => {
            currentWeekStartDate.setDate(currentWeekStartDate.getDate() + 7);
            renderApp();
        };
    }

    // Attach listeners to all "Edit" buttons for day logs
    document.querySelectorAll('.edit-log-button').forEach(button => {
        button.onclick = (e) => {
            const logId = e.currentTarget.dataset.id; // Get the log ID from the data attribute
            selectedDayLog = dayLogs.find(log => log.id === logId); // Find the log in the current array
            if (selectedDayLog) {
                showForm = true; // Show the log form modal
                renderApp(); // Re-render to display the modal with pre-filled data
            } else {
                showAppMessage("Log not found for editing.", true);
            }
        };
    });

    // Attach listeners to all "Delete" buttons for day logs
    document.querySelectorAll('.delete-log-button').forEach(button => {
        button.onclick = (e) => {
            logToDeleteId = e.currentTarget.dataset.id; // Get the log ID to delete
            showConfirmModal = true; // Show the confirmation modal
            renderApp(); // Re-render to display the modal
        };
    });

    // --- Log Form Modal Listeners ---
    const dayLogForm = document.getElementById('day-log-form');
    if (dayLogForm) {
        dayLogForm.onsubmit = async (e) => {
            e.preventDefault(); // Prevent default form submission
            const formData = new FormData(e.target); // Get form data
            const logData = {};

            // Iterate over form data entries to construct the logData object,
            // handling nested properties and specific data types (numbers, arrays).
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

            await handleSaveDayLog(logData); // Call the save handler with parsed data
        };

        const cancelLogButton = document.getElementById('cancel-log-button');
        if (cancelLogButton) {
            cancelLogButton.onclick = () => {
                showForm = false; // Hide the form modal
                selectedDayLog = null; // Clear selected log
                renderApp(); // Re-render to update UI
            };
        }
    }

    

    // --- Delete Confirmation Modal Listeners ---
    const confirmDeleteButton = document.getElementById('confirm-delete-button');
    if (confirmDeleteButton) {
        confirmDeleteButton.onclick = async () => {
            if (logToDeleteId) {
                await handleDeleteDayLog(logToDeleteId); // Call delete handler if ID is set
            }
        };
    }

    const cancelDeleteButton = document.getElementById('cancel-delete-button');
    if (cancelDeleteButton) {
        cancelDeleteButton.onclick = () => {
            showConfirmModal = false; // Hide the confirmation modal
            logToDeleteId = null; // Clear the ID to delete
            renderApp(); // Re-render to update UI
        };
    }
};

// --- Initial Setup and Authentication State Listener ---
// This is the core listener for Firebase Authentication. It runs once on page load
// and whenever the user's sign-in state changes (login, logout, token refresh).
onAuthStateChanged(auth, async (user) => {
    loadingAuth = false;
    currentUser = user;

    if (!user && !manualSignOut) {
        if (initialAuthToken) {
            try {
                await signInWithCustomToken(auth, initialAuthToken);
            } catch (error) {
                console.error("Error signing in with custom token:", error);
                try {
                    await signInAnonymously(auth);
                } catch (anonError) {
                    console.error("Error signing in anonymously:", anonError);
                }
            }
        } else {
            try {
                await signInAnonymously(auth);
            } catch (anonError) {
                console.error("Error signing in anonymously:", anonError);
            }
        }
        return; // Auth state will change again, listener will re-run.
    }

    // Reset the flag now that we've handled the logic for this auth change
    if (manualSignOut) {
        manualSignOut = false;
    }

    renderApp();

    if (currentUser && !currentUser.isAnonymous) {
        fetchDayLogs();
    } else {
        dayLogs = [];
        if (currentUser && currentUser.isAnonymous) {
            showAppMessage("You are signed in as a guest. Your data will not be saved permanently. Please sign up to save your logs.", true);
        }
    }
});

// Initial call to render the app. This will typically show the "Loading DayLens..." screen first.
renderApp();

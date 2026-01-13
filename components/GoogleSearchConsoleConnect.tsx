
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { GscSite, GscTokenResponse } from '../types';
import { fetchGscSites } from '../services/gscService';

const GSC_CLIENT_ID_STORAGE_KEY = 'seo-analyzer-gsc-client-id-v12';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

declare global {
  interface Window {
    google: any;
  }
}

interface GoogleSearchConsoleConnectProps {
    onConnect: (token: GscTokenResponse, sites: GscSite[]) => void;
    onDisconnect: () => void;
    isConnected: boolean;
}

export const GoogleSearchConsoleConnect: React.FC<GoogleSearchConsoleConnectProps> = ({ onConnect, onDisconnect, isConnected }) => {
    const [clientId, setClientId] = useState<string>(() => localStorage.getItem(GSC_CLIENT_ID_STORAGE_KEY) || '');
    const [inputClientId, setInputClientId] = useState<string>(clientId);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const clientRef = useRef<any>(null);
    
    const isClientConfigured = !!clientId;
    const currentOrigin = window.location.origin;

    const initClient = useCallback(() => {
        if (!clientId) return;
        
        // Final sanity check on clientId before initializing
        const cleanId = clientId.trim();
        if (!cleanId) return;

        if (window.google?.accounts?.oauth2) {
            try {
                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: cleanId,
                    scope: GSC_SCOPE,
                    callback: async (tokenResponse: GscTokenResponse) => {
                        if (tokenResponse.error) {
                            let userMsg = `Error: ${tokenResponse.error_description || tokenResponse.error}`;
                            if (tokenResponse.error === 'popup_closed_by_user') {
                                userMsg = 'Login cancelled (popup closed).';
                            } else if (tokenResponse.error === 'access_denied') {
                                userMsg = 'Access denied. You must grant permission to view Search Console data.';
                            }
                            setError(userMsg);
                            setIsLoading(false);
                            return;
                        }
                        try {
                            const sites = await fetchGscSites(tokenResponse.access_token);
                            onConnect(tokenResponse, sites);
                        } catch (e) {
                             setError(e instanceof Error ? e.message : 'An unknown error occurred while fetching sites.');
                        } finally {
                            setIsLoading(false);
                        }
                    },
                     error_callback: (error: any) => {
                        console.error('GSI Error:', error);
                        // If we get here, it's often a configuration mismatch
                        setError(`Google Client Error: ${error.message || 'The configuration is invalid. Check the Client ID and Origin.'}`);
                        setIsLoading(false);
                     }
                });
                clientRef.current = client;
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? `OAuth Client Error: ${e.message}` : 'An unknown error occurred initializing the OAuth client.');
            }
        } else {
             setTimeout(initClient, 500);
        }
    }, [clientId, onConnect]);

    useEffect(() => {
        if(isClientConfigured){
            initClient();
        }
    }, [isClientConfigured, initClient]);
    

    const handleConnect = () => {
        setError(null);
        setIsLoading(true);
        if (clientRef.current) {
            // Use 'consent' to force a fresh check, helps clear stale error states
            clientRef.current.requestAccessToken({prompt: 'consent'});
        } else {
            setError('Google Client not initialized. Please reset the Client ID.');
            setIsLoading(false);
            initClient();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove any whitespace immediately
        const val = e.target.value.replace(/\s/g, '');
        setInputClientId(val);
    };

    const handleSaveClientId = (e: React.FormEvent) => {
        e.preventDefault();
        // Aggressive sanitization
        const trimmedId = inputClientId.replace(/[\s\n\r]/g, '').trim();
        
        if (!trimmedId) {
             setError('Client ID cannot be empty.');
             return;
        }

        if (!trimmedId.endsWith('.apps.googleusercontent.com')) {
            setError('Invalid Client ID format. It must end with ".apps.googleusercontent.com"');
            return;
        }

        localStorage.setItem(GSC_CLIENT_ID_STORAGE_KEY, trimmedId);
        setClientId(trimmedId);
        setError(null);
    };
    
    const handleChangeClientId = () => {
        setClientId('');
        setInputClientId('');
        localStorage.removeItem(GSC_CLIENT_ID_STORAGE_KEY);
        clientRef.current = null;
        setError(null);
    }
    
    if (isConnected) {
        return (
            <div className="text-center animate-fade-in py-4">
                 <p className="text-lg text-green-400 font-semibold mb-4">Successfully connected to Google Search Console.</p>
                 <p className="text-sm text-gray-400 mb-6">You can now use real performance data in your analysis.</p>
                 <button onClick={onDisconnect} className="px-6 py-2.5 font-semibold text-gray-300 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors">
                    Disconnect
                </button>
            </div>
        )
    }

    if (!isClientConfigured) {
         return (
             <div className="animate-fade-in max-w-xl mx-auto">
                <form onSubmit={handleSaveClientId} className="space-y-6">
                    <div className="bg-gray-800/50 p-5 rounded-lg border border-gray-700 text-sm text-gray-300 text-left space-y-4">
                        <div className="bg-blue-900/30 border-l-4 border-blue-500 p-3 mb-4">
                            <h4 className="font-bold text-blue-300 flex items-center gap-2">
                                Setup Instructions
                            </h4>
                        </div>
                        <ol className="list-decimal list-inside space-y-3 text-gray-300">
                            <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console &gt; Credentials</a>.</li>
                            <li>Click <strong>Create Credentials</strong> &gt; <strong>OAuth client ID</strong>.</li>
                            <li className="bg-red-900/20 p-2 rounded border border-red-500/30">
                                <strong className="text-red-400 block mb-1">⚠️ CRITICAL STEP:</strong> 
                                Application type MUST be <strong>Web application</strong>.
                                <br/>
                                <span className="text-xs text-gray-400">Selecting "Desktop" causes Error 400.</span>
                            </li>
                            <li>
                                Under <strong>Authorized JavaScript origins</strong>, paste this EXACT URL:
                                <div className="mt-2 p-2 bg-black/50 rounded border border-gray-600 font-mono text-xs select-all cursor-pointer text-green-400 break-all" onClick={() => navigator.clipboard.writeText(currentOrigin)}>
                                    {currentOrigin}
                                </div>
                            </li>
                            <li>Click <strong>Create</strong> and copy the <strong>Client ID</strong> below.</li>
                        </ol>
                    </div>

                    <div className="text-center">
                        {error && <p className="text-red-400 mb-4 bg-red-900/50 border border-red-500 p-3 rounded-lg text-sm">{error}</p>}
                        <div className="flex flex-col gap-3">
                            <input 
                                type="text"
                                value={inputClientId}
                                onChange={handleInputChange}
                                placeholder="paste-your-client-id-here.apps.googleusercontent.com"
                                className="w-full px-4 py-3 bg-gray-800/80 text-gray-200 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition duration-200 placeholder-gray-600 text-center"
                                aria-label="Google Client ID"
                            />
                             <button
                                type="submit"
                                disabled={!inputClientId}
                                className="w-full px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors shadow-lg"
                            >
                               Save Configuration
                            </button>
                        </div>
                    </div>
                </form>
             </div>
         );
    }

    return (
        <div className="text-center py-4 max-w-lg mx-auto">
            <div className="bg-blue-900/20 border border-blue-800 p-4 rounded-lg mb-6">
                <p className="text-sm text-blue-200">
                    Configuration saved.
                </p>
                <p className="text-xs text-blue-300 mt-2 break-all">
                    Using Client ID: <strong>{clientId}</strong>
                </p>
            </div>
            
            {error && (
                <div className="text-left bg-red-900/50 border border-red-500 p-4 rounded-lg mb-6">
                    <p className="text-red-300 text-sm font-bold mb-1">Connection Failed</p>
                    <p className="text-red-200 text-sm">{error}</p>
                    <div className="mt-3 p-2 bg-red-950 rounded text-xs text-red-200">
                        <strong>Common Fixes:</strong>
                        <ul className="list-disc list-inside mt-1 ml-1">
                            <li>Check for hidden spaces in the Client ID.</li>
                            <li>Ensure "Authorized JavaScript origins" matches your URL exactly.</li>
                            <li>Wait 5 minutes after changing Google Cloud settings.</li>
                        </ul>
                    </div>
                </div>
            )}

            <button
                onClick={handleConnect}
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-3 px-6 py-3 text-base font-semibold text-white bg-gradient-to-r from-blue-600 to-teal-500 rounded-lg hover:from-blue-700 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-blue-500/30"
            >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12.5C5,8.75 8.36,5.73 12.19,5.73C15.04,5.73 16.56,6.95 17.03,7.39L19.24,5.28C17.58,3.84 15.3,2.73 12.19,2.73C6.77,2.73 2.5,7.24 2.5,12.5C2.5,17.76 6.77,22.27 12.19,22.27C17.6,22.27 21.5,18.33 21.5,12.81C21.5,12.09 21.43,11.59 21.35,11.1V11.1Z" /></svg>
                {isLoading ? 'Waiting for popup...' : 'Connect Google Account'}
            </button>
             <div className="mt-6">
                <button onClick={handleChangeClientId} className="text-xs text-gray-500 hover:text-gray-300 hover:underline">
                    Reset Client ID (Use a different key)
                </button>
            </div>
        </div>
    );
};

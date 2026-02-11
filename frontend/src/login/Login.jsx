import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // test
        // testing123
        try {
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                console.log('Login successful:', data);
                setSuccess('Login successful!')
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('Server connection failed');
        }
    };
    
    return (
        <div className="login-screen">
            <form id="wrapper" onSubmit={handleLogin}>
                {error && <p className="error-message" style={{ color: 'red' }}>{error}</p>}
                {success && <p className="success-message" style={{ color: 'green' }}>{success}</p>}
                <div id="wrapper">
                    <div>
                        <p className="host-screen__code-placeholder">
                            Username
                        </p>
                        <input type="text" id="fname" name="fname" className="login-input"
                        value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required/>
                    </div>
                    
                    <div>
                        <p className="host-screen__code-placeholder">
                            Password
                        </p>
                        <input type="password" id="fname" name="fname" className="login-input"
                        onChange={(e) => setPassword(e.target.value)} value={password}/>
                    </div>

                    <button type="submit" className="login-button">
                        Login
                    </button>
                </div>
            </form>
        </div>
    )
}
import React from 'react';
import './dashboard.css';
import Navbar from '../Navbar/Navbar';

export default function Dashboard() {
  // Placeholder
  const orientees = [
    {
      id: 1,
      name: 'Orientee 1',
      avatarUrl: 'https://placehold.co/200x200',
      status: 'Active',
    },
    {
      id: 2,
      name: 'Orientee 2',
      avatarUrl: 'https://placehold.co/200x200',
      status: '',
    },
    {
      id: 3,
      name: 'Orientee 3',
      avatarUrl: 'https://placehold.co/200x200',
      status: 'Active',
    },
    {
      id: 4,
      name: 'Orientee 4',
      avatarUrl: 'https://placehold.co/200x200',
      status: '',
    },
    {
      id: 5,
      name: 'Orientee 5',
      avatarUrl: 'https://placehold.co/200x200',
      status: 'Active',
    },
    {
      id: 6,
      name: 'Orientee 6',
      avatarUrl: 'https://placehold.co/200x200',
      status: '',
    },
    {
      id: 7,
      name: 'Orientee 7',
      avatarUrl: 'https://placehold.co/200x200',
      status: 'Active',
    },
  ];

return (
    <div className="dasbhoard-wrapper">
        <Navbar />
        <div className="dashboard-container">
            <div className="dashboard-bg" style={{ backgroundImage: `url(/background.png)` }}/>

            <aside className="sidebar">
                <h1 className="dashboard-title">My Group</h1>
                <div className="orientees-list">
                {orientees.map(o => (
                    <div key={o.id} className="orientees-item">
                    <img className="orientees-avatar" src={o.avatarUrl} alt={`${o.name} avatar`} />
                    <div className="orientee-info">
                        <span className="orientees-name">{o.name}</span>
                        {o.status && (
                        <div className="orientees-status">
                            <span className="status-dot" />
                            <span className="status-text">{o.status}</span>
                        </div>
                        )}
                    </div>
                    </div>
                ))}
                </div>
            </aside>

            {/* Main Content (The 2 Missing Sections) */}
            <main className="main-content">
                <section className="top-card">
                <div className="grey-placeholder" />
                <div className="grey-placeholder" />
                </section>
                
                <section className="bottom-card">
                {/* Content for the large bottom area */}
                </section>
            </main>
            </div>
    </div>
  );
}
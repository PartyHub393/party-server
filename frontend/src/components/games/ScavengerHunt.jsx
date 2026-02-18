import React, { useState } from 'react';
import './ScavengerHunt.css'

export default function ScavengerHunt() {
    return (
        <div className="scavenger-host-screen">
            <div className="category-selection">
                <h2>Case Scavenger Hunt</h2>
                <div className="category-cards">
                    <div className="category-card">
                        <h3>Set Team Name & Start</h3>
                        <p>Explore campus, complete challenges, and compete with other teams!</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
const Timeline = {
    generate24HourTimeline(habits, wakeUpTime, containerHeight = 800) {
        const wakeMinutes = this.timeToMinutes(wakeUpTime || '07:00');
        const headerSpace = 40;
        const footerSpace = 40;
        const availableHeight = containerHeight - headerSpace - footerSpace;
        
        // Sort habits by time relative to wake time
        const sortedHabits = [...habits].sort((a, b) => {
            const aMinutes = this.timeToMinutesSinceWake(a.effectiveTime, wakeMinutes);
            const bMinutes = this.timeToMinutesSinceWake(b.effectiveTime, wakeMinutes);
            return aMinutes - bMinutes;
        });
        
        // Step 1: Position tiles evenly
        const tileHeight = 70;
        const tileGap = 20;
        const positionedHabits = this.positionTilesEvenly(sortedHabits, headerSpace, tileHeight, tileGap);
        
        // Step 2: Generate dynamic time slots based on tile positions
        const timeSlots = this.generateDynamicTimeSlots(positionedHabits, wakeMinutes, headerSpace, availableHeight);
        
        return { timeSlots, positionedHabits };
    },
    
    // Core time conversion functions
    timeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const [hours, minutes] = timeStr.split(':');
        return parseInt(hours || 0) * 60 + parseInt(minutes || 0);
    },
    
    minutesToTime(minutes) {
        if (typeof minutes !== 'number' || isNaN(minutes)) return '00:00';
        const normalizedMinutes = ((minutes % 1440) + 1440) % 1440; // Normalize to 0-1439
        const hours = Math.floor(normalizedMinutes / 60);
        const mins = normalizedMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    },
    
    // Convert time to minutes since wake time (handles next day)
    timeToMinutesSinceWake(timeStr, wakeMinutes) {
        const timeMinutes = this.timeToMinutes(timeStr);
        let minutesSinceWake = timeMinutes - wakeMinutes;
        
        // If the time is before wake time, it's the next day
        if (minutesSinceWake < 0) {
            minutesSinceWake += 1440; // Add 24 hours
        }
        
        return minutesSinceWake;
    },
    
    // Convert minutes since wake back to actual time
    minutesSinceWakeToTime(minutesSinceWake, wakeMinutes) {
        const totalMinutes = (wakeMinutes + minutesSinceWake) % 1440;
        return this.minutesToTime(totalMinutes);
    },
    
    formatTime(timeStr, showMinutes = true) {
        if (!timeStr) return '';
        try {
            const [hours, minutes] = timeStr.split(':');
            const h = parseInt(hours);
            const m = parseInt(minutes);
            
            if (showMinutes) {
                const date = new Date();
                date.setHours(h, m);
                return date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            }
            
            // For ruler times (showMinutes = false), only show the hour
            const isPM = h >= 12;
            const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${displayHour} ${isPM ? 'PM' : 'AM'}`;
        } catch (error) {
            return timeStr;
        }
    },
    
    positionTilesEvenly(habits, startY, tileHeight, gap) {
        return habits.map((habit, index) => ({
            ...habit,
            position: startY + (index * (tileHeight + gap)) + (tileHeight / 2)
        }));
    },
    
    generateDynamicTimeSlots(positionedHabits, wakeMinutes, startY, maxHeight) {
        const timeSlots = [];
        const endY = startY + maxHeight;
        
        // Always start with wake time
        timeSlots.push({
            time: wakeMinutes,
            position: startY,
            label: this.formatTime(this.minutesToTime(wakeMinutes), true),
            type: 'wake',
            displayLabel: true
        });
        
        // Create key points including habit times
        const keyPoints = [{
            minutes: 0, // 0 minutes since wake
            position: startY,
            actualTime: wakeMinutes
        }];
        
        // Add habit positions as key points
        if (positionedHabits && positionedHabits.length > 0) {
            positionedHabits.forEach(habit => {
                const minutesSinceWake = this.timeToMinutesSinceWake(habit.effectiveTime, wakeMinutes);
                const actualMinutes = this.timeToMinutes(habit.effectiveTime);
                
                keyPoints.push({
                    minutes: minutesSinceWake,
                    position: habit.position,
                    actualTime: actualMinutes
                });
                
                // Add the exact habit time marker
                timeSlots.push({
                    time: actualMinutes,
                    position: habit.position,
                    label: '',
                    type: 'habit',
                    displayLabel: false
                });
            });
        }
        
        // Calculate the end position based on the last habit or minimum timeline length
        let finalPosition = endY;
        if (positionedHabits && positionedHabits.length > 0) {
            const lastHabitPosition = positionedHabits[positionedHabits.length - 1].position;
            // Ensure at least 100px after the last habit
            finalPosition = Math.max(lastHabitPosition + 100, endY);
        }
        
        // Add end point (24 hours after wake)
        keyPoints.push({
            minutes: 1440,
            position: finalPosition,
            actualTime: wakeMinutes // Back to wake time after 24 hours
        });
        
        // Sort keyPoints by minutes to ensure proper order
        keyPoints.sort((a, b) => a.minutes - b.minutes);
        
        // Generate hour markers with proper spacing
        const hourMarkers = [];
        
        // Calculate hours to show based on timeline span
        for (let hoursSinceWake = 0; hoursSinceWake <= 24; hoursSinceWake++) {
            const minutesSinceWake = hoursSinceWake * 60;
            
            // Find the two keypoints this hour falls between
            let startPoint = keyPoints[0];
            let endPoint = keyPoints[keyPoints.length - 1];
            
            for (let i = 0; i < keyPoints.length - 1; i++) {
                if (minutesSinceWake >= keyPoints[i].minutes && minutesSinceWake <= keyPoints[i + 1].minutes) {
                    startPoint = keyPoints[i];
                    endPoint = keyPoints[i + 1];
                    break;
                }
            }
            
            // Interpolate position
            const progress = (minutesSinceWake - startPoint.minutes) / (endPoint.minutes - startPoint.minutes);
            const position = startPoint.position + (endPoint.position - startPoint.position) * progress;
            
            // Skip if position is outside the visible area
            if (position < startY || position > finalPosition) continue;
            
            const actualMinutes = (wakeMinutes + minutesSinceWake) % 1440;
            
            hourMarkers.push({
                time: actualMinutes,
                position: position,
                label: this.formatTime(this.minutesToTime(actualMinutes), false),
                type: 'hour',
                displayLabel: true,
                minutesSinceWake: minutesSinceWake
            });
        }
        
        // Filter hour labels to prevent overlap
        const minLabelSpacing = 30;
        const filteredHourLabels = [];
        
        hourMarkers.forEach(marker => {
            // Don't add hour marker if it's too close to wake time
            if (Math.abs(marker.position - startY) < 15 && marker.minutesSinceWake !== 0) return;
            
            const tooClose = filteredHourLabels.some(existing => 
                Math.abs(existing.position - marker.position) < minLabelSpacing
            );
            
            if (!tooClose) {
                filteredHourLabels.push(marker);
                timeSlots.push(marker);
            }
        });
        
        // Add minor tick marks between hours
        for (let i = 0; i < keyPoints.length - 1; i++) {
            const start = keyPoints[i];
            const end = keyPoints[i + 1];
            
            const timeDiff = end.minutes - start.minutes;
            const posDiff = end.position - start.position;
            
            // Skip if segment is too small
            if (posDiff < 20) continue;
            
            // Determine tick interval based on density
            const pixelsPerMinute = posDiff / timeDiff;
            let interval;
            
            if (pixelsPerMinute < 0.5) {
                interval = 30; // Very dense: only 30 min marks
            } else if (pixelsPerMinute < 1) {
                interval = 15; // Dense: 15 min marks
            } else if (pixelsPerMinute < 2) {
                interval = 5; // Medium: 5 min marks
            } else {
                interval = 1; // Sparse: 1 min marks
            }
            
            // Add tick marks
            for (let m = start.minutes + interval; m < end.minutes; m += interval) {
                if (m % 60 === 0) continue; // Skip hours (already added)
                
                const actualMinutes = (wakeMinutes + m) % 1440;
                const progress = (m - start.minutes) / (end.minutes - start.minutes);
                const position = start.position + (end.position - start.position) * progress;
                
                let type = 'micro';
                if (m % 30 === 0) type = 'half';
                else if (m % 15 === 0) type = 'quarter';
                else if (m % 5 === 0) type = 'minor';
                
                timeSlots.push({
                    time: actualMinutes,
                    position: position,
                    label: '',
                    type: type,
                    displayLabel: false
                });
            }
        }
        
        // Sort all time slots by position
        timeSlots.sort((a, b) => a.position - b.position);
        
        return timeSlots;
    },
    
    // Calculate position from minutes since wake
    getPositionFromMinutesSinceWake(minutesSinceWake, keyPoints) {
        if (!keyPoints || keyPoints.length < 2) return 40;
        
        // Find the two points to interpolate between
        for (let i = 0; i < keyPoints.length - 1; i++) {
            const current = keyPoints[i];
            const next = keyPoints[i + 1];
            
            if (minutesSinceWake >= current.minutesSinceWake && 
                minutesSinceWake <= next.minutesSinceWake) {
                const progress = (minutesSinceWake - current.minutesSinceWake) / 
                               (next.minutesSinceWake - current.minutesSinceWake);
                return current.position + (next.position - current.position) * progress;
            }
        }
        
        // If past 24 hours, return end position
        if (minutesSinceWake > 1440) {
            return keyPoints[keyPoints.length - 1].position;
        }
        
        return keyPoints[0].position;
    }
};

// Utilities
const Utils = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    getCurrentTime() {
        const now = new Date();
        return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    },

    getCurrentMinutes() {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    },

    // Delegate to Timeline functions for consistency
    timeToMinutes(timeStr) {
        return Timeline.timeToMinutes(timeStr);
    },

    minutesToTime(minutes) {
        return Timeline.minutesToTime(minutes);
    },

    formatTime(timeStr, showMinutes) {
        return Timeline.formatTime(timeStr, showMinutes);
    },
    
    timeToMinutesSinceWake(timeStr, wakeMinutes) {
        return Timeline.timeToMinutesSinceWake(timeStr, wakeMinutes);
    },

    getDateKey(date = new Date()) {
        return date.toISOString().split('T')[0];
    },

    sanitize(str, maxLength = 100) {
        return str ? str.trim().slice(0, maxLength) : '';
    },

    addMinutesToTime(timeStr, minutes) {
        const baseMinutes = this.timeToMinutes(timeStr);
        const totalMinutes = baseMinutes + minutes;
        return this.minutesToTime(totalMinutes);
    },

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },

    getTimeUntil(targetTime, currentTime = null) {
        const currentMinutes = currentTime ? this.timeToMinutes(currentTime) : this.getCurrentMinutes();
        const targetMinutes = this.timeToMinutes(targetTime);
        let diff = targetMinutes - currentMinutes;
        
        if (diff < 0) {
            diff += 1440; // Add 24 hours if target is next day
        }
        
        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    },

    formatDuration(minutes) {
        if (minutes < 60) {
            return `${minutes}min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }
    },
    
    // Format time elapsed since wake
    formatTimeSinceWake(minutesSinceWake) {
        if (minutesSinceWake < 0) return "not yet";
        if (minutesSinceWake === 0) return "just now";
        
        const hours = Math.floor(minutesSinceWake / 60);
        const mins = minutesSinceWake % 60;
        
        if (hours > 0) {
            return `${hours}h ${mins}m ago`;
        } else {
            return `${mins}m ago`;
        }
    }
};

// Storage
const Storage = {
    async load() {
        try {
            // Always try localStorage first for better reliability
            const data = localStorage.getItem('habitTracker');
            const parsed = data ? JSON.parse(data) : this.getDefault();
            
            // Try to sync with Firebase if available
            if (window.db) {
                try {
                    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    const docRef = doc(window.db, 'users', this.getUserId());
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        const firebaseData = docSnap.data();
                        // Merge with local data, preferring more recent updates
                        if (firebaseData.updatedAt > parsed.updatedAt) {
                            localStorage.setItem('habitTracker', JSON.stringify(firebaseData));
                            return firebaseData;
                        }
                    }
                } catch (error) {
                    console.log('Firebase sync failed, using local data:', error);
                }
            }
            
            return parsed;
        } catch (error) {
            console.error('Load error:', error);
            return this.getDefault();
        }
    },

    async save(data) {
        try {
            // Always save to localStorage first
            const dataWithTimestamp = {
                ...data,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('habitTracker', JSON.stringify(dataWithTimestamp));
            
            // Try to sync with Firebase if available
            if (window.db) {
                try {
                    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    await setDoc(doc(window.db, 'users', this.getUserId()), dataWithTimestamp);
                } catch (error) {
                    console.log('Firebase sync failed, data saved locally:', error);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            return false;
        }
    },

    async saveHistory(historyData) {
        if (window.db) {
            try {
                const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                const historyRef = doc(window.db, 'history', this.getUserId() + '_' + Utils.getDateKey());
                await setDoc(historyRef, {
                    ...historyData,
                    userId: this.getUserId(),
                    savedAt: new Date().toISOString()
                });
                console.log('History saved to Firebase');
            } catch (error) {
                console.log('Firebase history save error:', error);
            }
        }
    },

    getUserId() {
        let userId = localStorage.getItem('userId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('userId', userId);
        }
        return userId;
    },

    getDefault() {
        return {
            templates: [],
            completions: {},
            subCompletions: {},
            awake: {},
            wakeUpTimes: {},
            history: {},
            settings: { theme: 'light', notifications: true }
        };
    },

    export() {
        const data = JSON.stringify(this.load(), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `habits-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    async import(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.templates && data.completions) {
                        this.save(data);
                        resolve(data);
                    } else {
                        reject(new Error('Invalid file format'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsText(file);
        });
    }
};

// Analytics
const Analytics = {
    calculateStreak(completions, habitCount) {
        if (!completions || habitCount === 0) return 0;
        
        let streak = 0;
        let date = new Date();
        
        for (let i = 0; i < 365; i++) {
            const key = Utils.getDateKey(date);
            const completed = completions[key] || [];
            const rate = habitCount > 0 ? completed.length / habitCount : 0;
            
            if (rate >= 0.8) {
                streak++;
                date.setDate(date.getDate() - 1);
            } else {
                break;
            }
        }
        
        return streak;
    },

    calculateWeeklyRate(completions, habitCount) {
        if (!completions || habitCount === 0) return 0;
        
        let total = 0;
        let completed = 0;
        
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = Utils.getDateKey(date);
            const dayCompleted = completions[key] || [];
            
            total += habitCount;
            completed += dayCompleted.length;
        }
        
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    },

    calculateDailyStats(data, habits) {
        if (!data || !habits) return null;
        
        const today = Utils.getDateKey();
        const yesterday = Utils.getDateKey(new Date(Date.now() - 86400000));
        
        const todayCompleted = (data.completions?.[today] || []).length;
        const yesterdayCompleted = (data.completions?.[yesterday] || []).length;
        
        let weekTotal = 0, weekCompleted = 0;
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = Utils.getDateKey(date);
            weekTotal += habits.length;
            weekCompleted += (data.completions?.[key] || []).length;
        }

        let allTimeTotal = 0, allTimeCompleted = 0;
        if (data.completions) {
            Object.keys(data.completions).forEach(date => {
                allTimeTotal += habits.length;
                allTimeCompleted += data.completions[date].length;
            });
        }

        return {
            today: {
                completed: todayCompleted,
                total: habits.length,
                rate: habits.length > 0 ? Math.round((todayCompleted / habits.length) * 100) : 0
            },
            yesterday: {
                completed: yesterdayCompleted,
                total: habits.length,
                rate: habits.length > 0 ? Math.round((yesterdayCompleted / habits.length) * 100) : 0
            },
            week: {
                completed: weekCompleted,
                total: weekTotal,
                rate: weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0
            },
            allTime: {
                completed: allTimeCompleted,
                total: allTimeTotal,
                rate: allTimeTotal > 0 ? Math.round((allTimeCompleted / allTimeTotal) * 100) : 0
            }
        };
    }
};

// Notifications
const Notifications = {
    async request() {
        if ('Notification' in window) {
            return await Notification.requestPermission() === 'granted';
        }
        return false;
    },

    show(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, { 
                body, 
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                requireInteraction: false
            });
            setTimeout(() => notification.close(), 5000);
            return notification;
        }
    },

    scheduleHabit(habit, wakeUpTime) {
        if (!habit || !habit.effectiveTime) return;
        
        const now = new Date();
        const [hours, minutes] = habit.effectiveTime.split(':');
        const habitTime = new Date();
        habitTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        
        if (habitTime <= now) {
            habitTime.setDate(habitTime.getDate() + 1);
        }
        
        const timeUntil = habitTime.getTime() - now.getTime();
        
        if (timeUntil > 0 && timeUntil < 24 * 60 * 60 * 1000) {
            setTimeout(() => {
                this.show(
                    `⏰ Time for: ${habit.title}`, 
                    habit.description || `Let's build this habit! Duration: ${habit.duration || 30} minutes`
                );
            }, timeUntil);
            
            if (timeUntil > 10 * 60 * 1000) {
                setTimeout(() => {
                    this.show(
                        `🔔 Upcoming: ${habit.title}`, 
                        `Starting in 10 minutes`
                    );
                }, timeUntil - 10 * 60 * 1000);
            }
        }
    },

    scheduleAllHabits(habits, wakeUpTime) {
        if (!habits || !Array.isArray(habits)) return;
        
        habits.forEach(habit => {
            if (!habit.completed && habit.effectiveTime) {
                this.scheduleHabit(habit, wakeUpTime);
            }
        });
    }
};

// Export to global scope
window.Storage = Storage;
window.Utils = Utils;
window.Analytics = Analytics;
window.Notifications = Notifications;
window.Timeline = Timeline;
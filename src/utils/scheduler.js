/**
 * scheduler.js - Manages periodic background audits.
 */

export class AuditScheduler {
    static ALARM_PREFIX = 'audit_schedule_';

    /**
     * Schedules an audit for a specific catalogue.
     * @param {string} catalogueId - ID of the catalogue.
     * @param {number} intervalMinutes - Frequency in minutes.
     */
    static async schedule(catalogueId, intervalMinutes) {
        const name = this.ALARM_PREFIX + catalogueId;
        await chrome.alarms.create(name, {
            periodInMinutes: intervalMinutes
        });
        console.log(`Scheduled audit for ${catalogueId} every ${intervalMinutes} minutes.`);
    }

    /**
     * Cancels a scheduled audit.
     */
    static async cancel(catalogueId) {
        const name = this.ALARM_PREFIX + catalogueId;
        await chrome.alarms.clear(name);
        console.log(`Cancelled schedule for ${catalogueId}`);
    }

    /**
     * Lists all active audit alarms.
     */
    static async listActive() {
        const alarms = await chrome.alarms.getAll();
        return alarms.filter(a => a.name.startsWith(this.ALARM_PREFIX));
    }
}

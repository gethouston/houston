use super::*;
impl Requests {
    pub fn drain(&mut self) {
        self.draining = true;
    }
    pub fn finished(&mut self, id: Uuid) {
        self.active.remove(&id);
    }
    pub fn cancel_all(&self) {
        for request in self.active.values() {
            request.cancel.cancel();
        }
    }
    pub fn expire(&mut self) -> Result<(), BridgeError> {
        let expired: Vec<_> = self
            .active
            .iter()
            .filter(|(_, r)| r.started.elapsed() >= Duration::from_secs(1800))
            .map(|(id, _)| *id)
            .collect();
        for id in expired {
            self.fail(id, "timeout")?;
        }
        Ok(())
    }
}

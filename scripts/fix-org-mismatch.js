/**
 * Fix org ID mismatch in the kanvaro database.
 * 
 * Problem: the setup wizard created a duplicate Organization document.
 * The admin user points to the new org, but all other data points to the
 * original org. This script merges them and fixes all user references.
 */
const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect('mongodb://localhost:27017/kanvaro');
  const db = mongoose.connection.db;
  const orgsCol = db.collection('organizations');
  const usersCol = db.collection('users');

  // The original org that has all existing data linked to it
  const originalOrgId = '698d54deb01431cb7c0697da';
  // The duplicate org created by the setup wizard
  const duplicateOrgId = '69a65db448f0caa5a9e067f9';

  // 1. Fix ALL users whose organization points to the duplicate
  const userFixResult = await usersCol.updateMany(
    { organization: new mongoose.Types.ObjectId(duplicateOrgId) },
    { $set: { organization: new mongoose.Types.ObjectId(originalOrgId) } }
  );
  console.log('Users fixed:', userFixResult.modifiedCount, 'doc(s) updated');

  // 2. Merge the duplicate org settings into the original org (keep original _id)
  const duplicateOrg = await orgsCol.findOne({ _id: new mongoose.Types.ObjectId(duplicateOrgId) });
  if (duplicateOrg) {
    const updateFields = {};
    if (duplicateOrg.name) updateFields.name = duplicateOrg.name;
    if (duplicateOrg.domain) updateFields.domain = duplicateOrg.domain;
    if (duplicateOrg.timezone) updateFields.timezone = duplicateOrg.timezone;
    if (duplicateOrg.currency) updateFields.currency = duplicateOrg.currency;
    if (duplicateOrg.language) updateFields.language = duplicateOrg.language;
    if (duplicateOrg.industry) updateFields.industry = duplicateOrg.industry;
    if (duplicateOrg.size) updateFields.size = duplicateOrg.size;
    if (duplicateOrg.settings) updateFields.settings = duplicateOrg.settings;
    if (duplicateOrg.billing) updateFields.billing = duplicateOrg.billing;
    if (duplicateOrg.emailConfig) updateFields.emailConfig = duplicateOrg.emailConfig;

    await orgsCol.updateOne(
      { _id: new mongoose.Types.ObjectId(originalOrgId) },
      { $set: updateFields }
    );
    console.log('Original org updated with latest settings');

    // 3. Delete the duplicate org
    const delResult = await orgsCol.deleteOne({ _id: new mongoose.Types.ObjectId(duplicateOrgId) });
    console.log('Duplicate org removed:', delResult.deletedCount, 'doc(s)');
  } else {
    console.log('No duplicate org found — nothing to merge');
  }

  // 4. Verify
  const orgs = await orgsCol.find({}).project({ _id: 1, name: 1 }).toArray();
  console.log('\nFinal organizations:', JSON.stringify(orgs, null, 2));
  const users = await usersCol.find({}).project({ _id: 1, email: 1, organization: 1 }).toArray();
  console.log('\nFinal users:', JSON.stringify(users, null, 2));

  await mongoose.disconnect();
  console.log('\nDone! All users now point to the correct organization.');
}

fix().catch(err => { console.error(err); process.exit(1); });

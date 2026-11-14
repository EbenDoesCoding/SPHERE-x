import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import requests
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.table import Table
import astropy.units as u
import archive_access as archive
import spherex as sx

ROOT=Path(__file__).parent
URL='https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W20_2D/l2b-v27-2026-198/2/level2_2025W20_2D_0176_4D2_spx_l2b-v27-2026-198.fits'
ROW={'uri':archive.cutout_url(URL,210.80227,54.34895,.3),'mjd':60811.55,'detector':2,'release':'dr1','file_id':'test.fits'}

class ArchiveTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.cache=Path(self.temp.name)
  self.patch=patch.object(archive,'CACHE',self.cache);self.patch.start()
 def tearDown(self):
  self.patch.stop();self.temp.cleanup()
 def test_tap_failure_uses_sia_and_then_cached_catalog(self):
  with patch.object(archive,'query_tap',side_effect=requests.ConnectionError()),patch.object(archive,'query_sia',return_value=[ROW]) as sia:
   rows,source,_=archive.discover(210.80227,54.34895,.3,2)
   self.assertEqual(source,'irsa-sia');self.assertEqual(rows,[ROW]);self.assertEqual(sia.call_count,1)
   self.assertEqual(archive.discover(210.80227,54.34895,.3,2)[1],'cached-catalog')
   self.assertEqual(sia.call_count,1)
 def test_successful_empty_search_does_not_invent_fallback(self):
  with patch.object(archive,'query_tap',return_value=[]),patch.object(archive,'_local_rows') as local:
   self.assertEqual(archive.discover(1,2,.05)[0],[]);local.assert_not_called()
 @unittest.skipUnless((ROOT/"archive_cache/seed/m101-may.fits").is_file() and (ROOT/"archive_cache/seed/m101-june-full.fits").is_file() and (ROOT/"archive_cache/local-index.json").is_file(), "Run seed_official_samples.py for real FITS integration tests")
 def test_outage_only_uses_files_with_real_sky_coverage(self):
  with patch.object(archive,'CACHE',ROOT/'archive_cache'),patch.object(archive,'query_tap',side_effect=OSError()),patch.object(archive,'query_sia',side_effect=OSError()):
   rows,source,warnings=archive.discover(210.80227,54.34895,.3,2)
   self.assertEqual(len(rows),3);self.assertEqual(source,'local-fits-index');self.assertTrue(warnings)
   with self.assertRaises(archive.ArchiveUnavailable):archive.discover(1,-89,.05,2)
 def test_cloud_mapping_rejects_non_archive_urls(self):
  self.assertEqual(archive.cloud_url(URL+'?size=.3'),'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/'+URL.split('/spherex/')[1])
  for bad in ['http://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/a.fits','https://example.com/a.fits','file:///a.fits',URL.replace('/dr1/','/../')]:
   with self.assertRaises(ValueError):archive.cloud_url(bad)
 @unittest.skipUnless((ROOT/"archive_cache/seed/m101-may.fits").is_file() and (ROOT/"archive_cache/seed/m101-june-full.fits").is_file() and (ROOT/"archive_cache/local-index.json").is_file(), "Run seed_official_samples.py for real FITS integration tests")
 def test_cutout_failure_uses_mirror_and_caches_download(self):
  calls=[]
  def download(url,path):
   calls.append(url)
   if 'irsa.ipac.caltech.edu' in url:raise requests.ConnectionError('cutout unavailable')
   path.parent.mkdir(parents=True,exist_ok=True)
   shutil.copy2(ROOT/'archive_cache/seed/m101-may.fits',path)
  ref=sx.ImageRef(ROW['uri'],ROW['mjd'],2,'dr1','test')
  with patch.object(archive,'_download',side_effect=download),patch.object(archive.time,'sleep'):
   path,source,crop=archive.obtain(ref)
   self.assertTrue(path.is_file());self.assertEqual(source,'nasa-s3');self.assertTrue(crop)
   archive.obtain(ref);self.assertEqual(len(calls),3)
 def test_sia_columns_to_valid_cutout_refs(self):
  table=Table({'access_url':[URL,URL],'t_min':[60811.55,60811.55]})
  rows=archive.normalize_rows(table,'sia',210.8,54.3,.1,2)
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['detector'],2)
  self.assertIn('size=0.10000000',rows[0]['uri'])
 def test_vo_error_with_http_200_is_not_empty_coverage(self):
  xml=b'<VOTABLE><RESOURCE><INFO name="QUERY_STATUS" value="ERROR">failed</INFO></RESOURCE></VOTABLE>'
  with self.assertRaises(archive.ArchiveUnavailable):archive.parse_table(xml)
 @unittest.skipUnless((ROOT/"archive_cache/seed/m101-may.fits").is_file() and (ROOT/"archive_cache/seed/m101-june-full.fits").is_file() and (ROOT/"archive_cache/local-index.json").is_file(), "Run seed_official_samples.py for real FITS integration tests")
 def test_real_full_exposure_crops_and_preserves_wavelength(self):
  full=ROOT/'archive_cache/seed/m101-june-full.fits'
  ref=sx.ImageRef(archive.cutout_url(URL,210.80227,54.34895,.05),61100,2,'qr3','test')
  with patch.object(archive,'obtain',return_value=(full,'nasa-s3-cache',True)):
   cutout=sx._read_cutout(ref,SkyCoord(210.80227*u.deg,54.34895*u.deg))
  self.assertLessEqual(cutout.image.shape[0],31)
  self.assertEqual(cutout.image.shape,cutout.flags.shape)
  self.assertAlmostEqual(cutout.wavelength_um,1.48412121,6)
  x,y=cutout.wcs.world_to_pixel(SkyCoord(210.80227*u.deg,54.34895*u.deg))
  self.assertTrue(0<=x<cutout.image.shape[1] and 0<=y<cutout.image.shape[0])
  self.assertTrue(np.isfinite(cutout.image).any())

if __name__=='__main__':unittest.main(verbosity=2)

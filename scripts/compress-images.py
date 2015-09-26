from datetime import datetime
import glob
from multiprocessing import Pool, cpu_count
import os
import subprocess
import sys


orig_total = 0
after_total = 0


def main():
    for dir in sys.argv[1:]:
        for (dirpath, dirnames, filenames) in os.walk(dir):
            compress_dir(dirpath)

    log('Original total: {} KB', orig_total >> 10)
    log('Compressed total: {} KB', after_total >> 10)


def compress_dir(dirpath):
    global orig_total
    global after_total

    fns = glob.glob(dirpath + '/*.png')
    if not fns:
        return

    log('Processing {}', dirpath)

    orig = sum(map(os.path.getsize, fns))
    orig_total += orig
    log('Original size: {} KB', orig >> 10)

    with Pool(processes=cpu_count()) as pool:
        for fn in fns:
            pool.apply_async(compress_file, [fn])
        pool.close()
        pool.join()

    after = sum(map(os.path.getsize, fns))
    after_total += after
    log('Compressed size: {} KB', after >> 10)


def compress_file(fn):
    # Try a few different settings to get the smallest file possible
    subprocess.Popen(['pngout', fn], stdout=subprocess.PIPE).communicate()
    subprocess.Popen(['pngout', '/c0', fn], stdout=subprocess.PIPE).communicate()
    subprocess.Popen(['pngout', '/c2', fn], stdout=subprocess.PIPE).communicate()
    subprocess.Popen(['pngout', '/c3', fn], stdout=subprocess.PIPE).communicate()
    subprocess.Popen(['pngout', '/c4', fn], stdout=subprocess.PIPE).communicate()
    subprocess.Popen(['pngout', '/c6', fn], stdout=subprocess.PIPE).communicate()


def log(fmt, *args):
    print(('{} - ' + fmt).format(datetime.utcnow(), *args))


if __name__ == '__main__':
    main()
